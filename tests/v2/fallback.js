const query = require('../query');
const should = require('should');

describe('fallback', function () {
  it('count', function (done) {
    query('/v2/fallback', {
      requests: [
        { url: '/langvar', query: { id: 0 } },
        { url: '/langvar', query: { id: 187 } },
      ]
    },
    done,
    function (data) {
      should.exist(data.result);
      data.result.length.should.equal(1);
      data.result[0].id.should.equal(187);
      done();
    });
  });
});
