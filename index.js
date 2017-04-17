const zlib = require('zlib');
const async = require('async');
const https = require('https');

// Send metrics to insights.
// Required ENV vars: INSIGHTS_INSERT_KEY + NEWRELIC_ACCOUNT_ID
var sendToInsights = function(eventName, payload, insightsCb) {
  var requestOptions = {
    host: 'insights-collector.newrelic.com',
    headers: {
      'Content-Type': 'application/json',
      'X-Insert-Key': process.env.INSIGHTS_INSERT_KEY
    },
    method: 'POST',
    port: 443,
    path: `/v1/accounts/${process.env.NEWRELIC_ACCOUNT_ID}/events`
  };

  var request = https.request(requestOptions, function(resp) {
    resp.setEncoding('utf8');
    var body = '';
    resp.on('data', function(chunk) {
      body += chunk;
    });
    resp.on('end', function() {
      console.log('insights response: ', body);
      insightsCb(null);
    });
  }).on('error', function(error) {
    console.log(`Got error sending data to insights: ${e.message}`);
    insightsCb(e.message);
  });

  var customEvent = payload;
  customEvent.eventType = eventName;
  console.log(`Sending "${customEvent}" to New Relic Insights...`);
  request.write(JSON.stringify([customEvent]));
  request.end();
};


exports.handler = (event, context, awsCallback) => {
    const payload = new Buffer(event.awslogs.data, 'base64');
    zlib.gunzip(payload, (err, res) => {
        if (err) {
            return awsCallback(err);
        }
        const parsed = JSON.parse(res.toString('utf8'));
        console.log('Decoded payload:', JSON.stringify(parsed));
        var logEvents = parsed.logEvents;
        /*
        "logEvents": [
        {
            "id": "33281720681425280557137581835279382212549040691317440512",
            "timestamp": 1492403970591,
            "message": "2017-04-17T04:39:30.591Z\td8ae7cb1-2327-11e7-ab7f-534a8a737b38\t#logEvent,lambdaMemory,{\"memTotal\":3857664,\"memFree\":3132912,\"memAvail\":3332208,\"uptime\":14362,\"idleTime\":28658,\"coldStart\":0,\"awsRequestId\":\"d8ae7cb1-2327-11e7-ab7f-534a8a737b38\",\"bootId\":\"07cb0b0a-d725-4dd0-8c9e-3c4f41c2f0ab\",\"hostname\":\"ip-10-13-78-112\",\"machineId\":\"83b0e9b3b38344edaa042edf1a9c8e58\",\"sessionId\":\"4294967295\"}\n"
        }
    ]
        */
        async.each(logEvents, function(event, callback) {
            var parts = event.message.split(',');
            var eventName = parts[1];
            var p = parts.slice(2, parts.length).join();

            console.log(`Attempting to parse JSON payload: "${p}"`);
            try {
                var message = JSON.parse(p);
            } catch (e) {
                // swallow error if we can't find a json payload
                console.error('Could not parse payload: %s', e);
                return callback();
            }
            console.log(`Parsed: "${message}"`);
            sendToInsights(eventName, message, function(err) {
                callback(err);
            })
        }, function(error) {
            if (error) {
                return awsCallback(error, null);
            }
            awsCallback(null, `Successfully processed ${parsed.logEvents.length} log events.`);
        });
    });
};