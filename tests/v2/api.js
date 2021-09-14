const query = require('../query');
const should = require('should');

describe('global parameter', function () {
  it('echo', function (done) {
    const request = { url: '/v2/expr', query: { uid: ["eng-000"], txt: ["ideal"], echo: true } };
    query(request.url, request.query, done,
    function (data) {
      should.exist(data.request);
      data.request.should.eql(request);
      done();
    });
  });

  it('limit', function (done) {
    query('/v2/langvar', { limit: 5 }, done,
    function (data) {
      data.result.length.should.equal(5);
      data.resultNum.should.equal(5);
      done();
    });
  });

  it('offset', function (done) {
    query('/v2/langvar', { sort: "lang_code", offset: 5000, limit: 1 }, done,
    function (data) {
      data.result[0].lang_code.should.not.match(/^a/);
      done();
    });
  });
});
