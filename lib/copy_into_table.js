const copyFrom = require('pg-copy-streams').from;
const eos = require('end-of-stream');

module.exports = function(trx, table, data) {
  return trx.client.acquireConnection()
  .then(client => {
    return new Promise((resolve, reject) => {
      const stream = client.query(copyFrom(`COPY ${table} FROM STDIN`));

      eos(stream, err => {
        (err ? reject : resolve)(err);
      });

      stream.write(data instanceof Array ? data.join('') : data);
      stream.end();
    });
  });
};
