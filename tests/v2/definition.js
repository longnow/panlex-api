const query = require('../query');
const should = require('should');

describe('definition', function () {
  it('all params', function (done) {
    query('/v2/definition', {
        expr: 1,
        expr_langvar: [187, 666],
        expr_txt: 'foo',
        expr_txt_degr: 'bar',
        expr_uid: 'eng-000',
        id: [1,2,3],
        include: ['expr_langvar','expr_txt','expr_txt_degr','expr_uid','uid'],
        langvar: 187,
        meaning: 5,
        txt: 'hello',
        txt_degr: 'blah',
        uid: ['eng-000','spa-000'],
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('url param with include', function (done) {
    query('/v2/definition/5', {
        include: ['uid'],
    },
    done,
    function (data) {
      should.exist(data.definition);
      done();
    });
  });
});
