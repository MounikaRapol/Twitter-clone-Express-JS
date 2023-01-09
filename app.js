const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();

app.use(express.json());

let database = null;

const initializeDBAndServer = async () => {
  try {
    database = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};
initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "Mouni_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 1

//User Register API
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUser = `select username from user where username='${username}';`;
  const dbUser = await database.get(checkUser);
  console.log(dbUser);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists"); //Scenario 1
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short"); //Scenario 2
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const requestQuery = `insert into user(name, username, password, gender) values(
          '${name}','${username}','${hashedPassword}','${gender}');`;
      await database.run(requestQuery);
      response.status(200);
      response.send("User created successfully"); //Scenario 3
    }
  }
});

//API 2

//User Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User"); //Scenario 1
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "Mouni_SECRET_TOKEN");
      response.send({ jwtToken }); //Scenario 3
    } else {
      response.status(400);
      response.send("Invalid Password"); //Scenario 2
    }
  }
});

//If user1 follows user2 then,
//follower_user_id is the user ID of user1 and following_user_id is the user ID of user2.
//following_user is you
//follower_user is the people who follow you

//API 3

//Approach
//1.get following_user_id from username
//2.get follower_user_ids from followeing_user_id
//3.get follower_user_ids array

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  //1.get following user id from user name
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  //console.log(getUserId);
  //2.get follower user ids from user id
  const getFollowerIdsQuery = `SELECT following_user_id 
                                FROM follower 
                                    WHERE follower_user_id=${getUserId.user_id};`;
  const getFollowerIds = await database.all(getFollowerIdsQuery);
  //console.log(getFollowerIds);
  //3.get follower ids array
  const getFollowerIdsArray = getFollowerIds.map((eachUser) => {
    return eachUser.following_user_id;
  });
  //console.log(getFollowerIdsArray);
  //query
  const getTweetQuery = `select user.username, tweet.tweet, tweet.date_time as dateTime 
        from user inner join tweet 
        on user.user_id= tweet.user_id where user.user_id in (${getFollowerIdsArray})
        order by tweet.date_time desc limit 4 ;`;
  const responseResult = await database.all(getTweetQuery);
  //console.log(responseResult);
  response.send(responseResult);
});

//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT * FROM user WHERE username="${username}"`;
  const getUserId = await database.get(getUserIdQuery);
  const getFollowerIdsQuery = `SELECT following_user_id 
                                FROM follower 
                                    WHERE follower_user_id=${getUserId.user_id};`;
  const getFollowerIds = await database.all(getFollowerIdsQuery);
  const getFollowerIdsArray = getFollowerIds.map((eachUser) => {
    return eachUser.following_user_id;
  });
  const getFollowersResultQuery = `select name from user where user_id in (${getFollowerIdsArray});`;
  const responseResult = await database.all(getFollowersResultQuery);
  //console.log(responseResult);
  response.send(responseResult);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  //console.log(getUserId);
  const getFollowerIdsQuery = `select follower_user_id from follower where following_user_id=${getUserId.user_id};`;
  const getFollowerIdsArray = await database.all(getFollowerIdsQuery);
  console.log(getFollowerIdsArray);
  const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
    return eachUser.follower_user_id;
  });
  console.log(`${getFollowerIds}`);
  //get tweet id of user following x made
  const getFollowersNameQuery = `select name from user where user_id in (${getFollowerIds});`;
  const getFollowersName = await database.all(getFollowersNameQuery);
  //console.log(getFollowersName);
  response.send(getFollowersName);
});

//API 6

const getOutput = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.date_time,
  };
};

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  //console.log(tweetId);
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  // console.log(getUserId);
  //get the ids of whom the use is following
  const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
  const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
  //console.log(getFollowingIdsArray);
  const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
    return eachFollower.following_user_id;
  });
  //console.log(getFollowingIds);
  //get the tweets made by the users he is following
  const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
  const getTweetIdsArray = await database.all(getTweetIdsQuery);
  const followingTweetIds = getTweetIdsArray.map((eachId) => {
    return eachId.tweet_id;
  });
  // console.log(followingTweetIds);
  //console.log(followingTweetIds.includes(parseInt(tweetId)));
  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likes_count_query = `select count(user_id) as likes from like where tweet_id=${tweetId};`;
    const likes_count = await database.get(likes_count_query);
    //console.log(likes_count);
    const reply_count_query = `select count(user_id) as replies from reply where tweet_id=${tweetId};`;
    const reply_count = await database.get(reply_count_query);
    // console.log(reply_count);
    const tweet_tweetDateQuery = `select tweet, date_time from tweet where tweet_id=${tweetId};`;
    const tweet_tweetDate = await database.get(tweet_tweetDateQuery);
    //console.log(tweet_tweetDate);
    response.send(getOutput(tweet_tweetDate, likes_count, reply_count));
  } else {
    response.status(401);
    response.send("Invalid Request");
    //console.log("Invalid Request");
  }
});

//API 7
const convertLikedUserNameDBObjToResponseObj = (dbObject) => {
  return {
    likes: dbObject,
  };
};
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    //console.log(tweetId);
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await database.get(getUserIdQuery);
    //console.log(getUserId);
    //get the ids of whom thw use is following
    const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
    //console.log(getFollowingIdsArray);
    const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });
    //console.log(getFollowingIds);
    //check is the tweet ( using tweet id) made by his followers
    const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
    const getTweetIdsArray = await database.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });
    //console.log(getTweetIds);
    //console.log(getTweetIds.includes(parseInt(tweetId)));
    if (getTweetIds.includes(parseInt(tweetId))) {
      const getLikedUsersNameQuery = `select user.username as likes from user inner join like
       on user.user_id=like.user_id where like.tweet_id=${tweetId};`;
      const getLikedUserNamesArray = await database.all(getLikedUsersNameQuery);
      //console.log(getLikedUserNamesArray);
      const getLikedUserNames = getLikedUserNamesArray.map((eachUser) => {
        return eachUser.likes;
      });
      // console.log(getLikedUserNames);
      /*console.log(
        convertLikedUserNameDBObjToResponseObj(getLikedUserNames)
      );*/
      response.send(convertLikedUserNameDBObjToResponseObj(getLikedUserNames));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8

const convertUserNameReplyedDBObjToResponseObj = (dbObject) => {
  return {
    replies: dbObject,
  };
};
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    //tweet id of which we need to get reply's
    const { tweetId } = request.params;
    console.log(tweetId);
    //user id from user name
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await database.get(getUserIdQuery);
    // console.log(getUserId);
    //get the ids of whom the user is following
    const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
    //console.log(getFollowingIdsArray);
    const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });
    console.log(getFollowingIds);
    //check if the tweet ( using tweet id) made by the person he is  following
    const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
    const getTweetIdsArray = await database.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });
    console.log(getTweetIds);
    //console.log(getTweetIds.includes(parseInt(tweetId)));
    if (getTweetIds.includes(parseInt(tweetId))) {
      //get reply's
      //const getTweetQuery = `select tweet from tweet where tweet_id=${tweetId};`;
      //const getTweet = await database.get(getTweetQuery);
      //console.log(getTweet);
      const getUsernameReplyTweetsQuery = `select user.name, reply.reply from user inner join reply on user.user_id=reply.user_id
      where reply.tweet_id=${tweetId};`;
      const getUsernameReplyTweets = await database.all(
        getUsernameReplyTweetsQuery
      );
      //console.log(getUsernameReplyTweets);
      /* console.log(
        convertUserNameReplyedDBObjToResponseObj(getUsernameReplyTweets)
      );*/

      response.send(
        convertUserNameReplyedDBObjToResponseObj(getUsernameReplyTweets)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  //console.log(getUserId);
  //get tweets made by user
  const getTweetIdsQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
  const getTweetIdsArray = await database.all(getTweetIdsQuery);
  /**const getTweetIds = getTweetIdsArray.map((eachId) => {
    return parseInt(eachId.tweet_id);
  });**/
  //console.log(getTweetIds);
  const followingTweetIds = getTweetIdsArray.map((eachId) => {
    return eachId.tweet_id;
  });
  // console.log(followingTweetIds);
  //console.log(followingTweetIds.includes(parseInt(tweetId)));
  const likes_count_query = `select count(user_id) as likes from like where tweet_id=${tweetId};`;
  const likes_count = await database.get(likes_count_query);
  //console.log(likes_count);
  const reply_count_query = `select count(user_id) as replies from reply where tweet_id=${tweetId};`;
  const reply_count = await database.get(reply_count_query);
  // console.log(reply_count);
  const tweet_tweetDateQuery = `select tweet, date_time from tweet where tweet_id=${tweetId};`;
  const tweet_tweetDate = await database.get(tweet_tweetDateQuery);
  //console.log(tweet_tweetDate);
  response.send(getOutput(tweet_tweetDate, likes_count, reply_count));
});

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  //console.log(getUserId.user_id);
  const { tweet } = request.body;
  //console.log(tweet);
  //const currentDate = format(new Date(), "yyyy-MM-dd HH-mm-ss");
  const currentDate = new Date();
  console.log(currentDate.toISOString().replace("T", " "));

  const postRequestQuery = `insert into tweet(tweet, user_id, date_time) values ("${tweet}", ${getUserId.user_id}, '${currentDate}');`;

  const responseResult = await database.run(postRequestQuery);
  const tweet_id = responseResult.lastID;
  response.send("Created a Tweet");
});

/*
//to check if the tweet got updated
app.get("/tweets/", authenticateToken, async (request, response) => {
  const requestQuery = `select * from tweet;`;
  const responseResult = await database.all(requestQuery);
  response.send(responseResult);
});*/

//deleting the tweet

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    //console.log(tweetId);
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await database.get(getUserIdQuery);
    //console.log(getUserId.user_id);
    //tweets made by the user
    const getUserTweetsListQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
    const getUserTweetsListArray = await database.all(getUserTweetsListQuery);
    const getUserTweetsList = getUserTweetsListArray.map((eachTweetId) => {
      return eachTweetId.tweet_id;
    });
    console.log(getUserTweetsList);
    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `delete from tweet where tweet_id=${tweetId};`;
      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
