const config = require('./config');
const worker = __dirname + '/worker.js';

if (config.cluster) {
  const cluster = require('cluster');

  cluster.setupMaster({
    exec: worker,
    silent: false
  });

  const numCPUs = require('os').cpus().length;

  for (let i = 0; i < numCPUs; i++) cluster.fork();

  cluster.on('exit', function(worker, code, signal) {
    console.log('%s - worker %d died (%s), restarting...', new Date().toISOString(), worker.process.pid, signal || code);
    cluster.fork();
  });

  if (config.log) {
    process.on('SIGUSR2', () => {
      for (const id in cluster.workers) {
        cluster.workers[id].send('SIGUSR2');
      }
    });
  }
}
else {
  require(worker);
}
