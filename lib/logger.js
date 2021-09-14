const bunyan = require('bunyan');
const errors = require('restify-errors');
const config = require('../config');
const logFile = config.log;
const logRequestBodyMax = require('../config').logRequestBodyMax || 512;

const logger = module.exports = {};

if (logFile) {
  logger.log = bunyan.createLogger({
    name: require('../package.json').name,

    streams: [{
      type:   'file',
      path:   logFile
    }],

    serializers: {
      req: reqSerializer,
      res: bunyan.stdSerializers.res
    }
  });

  createErrorLog();

  // if running as a single process, it will receive the SIGUSR2 directly as a signal to reopen log files
  // otherwise, it will be passed through as a message from the master process
  const evt = config.cluster ? 'message' : 'SIGUSR2';
  process.on(evt, () => {
    logger.log.reopenFileStreams();
    createErrorLog();
  });
}

function createErrorLog() {
  logger.errorLog = logger.log.child({
    error: true,
    serializers: {
      err: bunyan.stdSerializers.err,
      req: reqSerializer,
      res: resErrorSerializer
    }
  });
}

function reqSerializer(req) {
  if (!req || !req.connection) return req;

  const record = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    remoteAddress: req.connection.remoteAddress,
    remotePort: req.connection.remotePort
  };

  if (req._body && req._body.length <= logRequestBodyMax) {
    record.body = req.body;
  }

  return record;
}

function resErrorSerializer(res) {
  if (!res || !res.statusCode) return res;

  const body = res._body instanceof errors.HttpError
    ? res._body.body
    : res._body;

  return {
    statusCode: res.statusCode,
    headers: res.getHeaders(),
    body: body
  };
}
