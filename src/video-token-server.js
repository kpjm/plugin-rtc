/* global Twilio */
'use strict';

const AccessToken = Twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;
const MAX_ALLOWED_SESSION_DURATION = 14400;

module.exports.handler = async (context, event, callback) => {
  const {
    ACCOUNT_SID,
    TWILIO_API_KEY_SID,
    TWILIO_API_KEY_SECRET,
    API_PASSCODE,
    API_PASSCODE_EXPIRY,
    DOMAIN_NAME,
    ROOM_TYPE,
  } = context;

  const { user_identity, room_name, passcode, create_room = true } = event;
  const [, appID, serverlessID] = DOMAIN_NAME.match(/-?(\d*)-(\d+)(?:-\w+)?.twil.io$/);

  let response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  if (typeof create_room !== 'boolean') {
    response.setStatusCode(400);
    response.setBody({
      error: {
        message: 'invalid parameter',
        explanation: 'A boolean value must be provided for the create_room parameter',
      },
    });
    return callback(null, response);
  }

  if (Date.now() > API_PASSCODE_EXPIRY) {
    response.setStatusCode(401);
    response.setBody({
      error: {
        message: 'passcode expired',
        explanation:
          'The passcode used to validate application users has expired. Re-deploy the application to refresh the passcode.',
      },
    });
    return callback(null, response);
  }

  if (API_PASSCODE + appID + serverlessID !== passcode) {
    response.setStatusCode(401);
    response.setBody({
      error: {
        message: 'passcode incorrect',
        explanation: 'The passcode used to validate application users is incorrect.',
      },
    });
    return callback(null, response);
  }

  if (!user_identity) {
    response.setStatusCode(400);
    response.setBody({
      error: {
        message: 'missing user_identity',
        explanation: 'The user_identity parameter is missing.',
      },
    });
    return callback(null, response);
  }

  if (create_room) {
    const client = context.getTwilioClient();

    try {
      await client.video.rooms.create({ uniqueName: room_name, type: ROOM_TYPE });
    } catch (e) {
      // Ignore 53113 error (room already exists). See: https://www.twilio.com/docs/api/errors/53113
      if (e.code !== 53113) {
        response.setStatusCode(500);
        response.setBody({
          error: {
            message: 'error creating room',
            explanation: 'Something went wrong when creating a room.',
          },
        });
        return callback(null, response);
      }
    }
  }

  const token = new AccessToken(ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, {
    ttl: MAX_ALLOWED_SESSION_DURATION,
  });
  token.identity = user_identity;
  const videoGrant = new VideoGrant({ room: room_name });
  token.addGrant(videoGrant);
  response.setStatusCode(200);
  response.setBody({ token: token.toJwt(), room_type: create_room ? ROOM_TYPE : null });
  return callback(null, response);
};
