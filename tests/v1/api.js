const query = require('../query');
const should = require('should');

describe('global parameter', function () {
  it('echo', function (done) {
    const request = { url: '/ex', query: { uid: ["eng-000"], tt: ["ideal"], echo: true } };
    query(request.url, request.query, done,
    function (data) {
      should.exist(data.request);
      data.request.should.eql(request);
      done();
    });
  });

  it('limit', function (done) {
    query('/lv', { limit: 5 }, done,
    function (data) {
      data.result.length.should.equal(5);
      data.resultNum.should.equal(5);
      done();
    });
  });

  it('offset', function (done) {
    query('/lv', { sort: "lc", offset: 5000, limit: 1 }, done,
    function (data) {
      data.result[0].lc.should.not.match(/^a/);
      done();
    });
  });
});
