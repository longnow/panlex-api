const query = require('../query');
const should = require('should');

describe('df', function () {
  it('all params', function (done) {
    query('/df', {
        ex: 1,
        exlv: [187, 666],
        extt: 'foo',
        extd: 'bar',
        exuid: 'eng-000',
        df: [1,2,3],
        include: ['exlv','extt','extd','exuid','uid'],
        lv: 187,
        mn: 5,
        tt: 'hello',
        td: 'blah',
        uid: ['eng-000','spa-000'],
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('url param with include', function (done) {
    query('/df/5', {
        include: ['uid'],
    },
    done,
    function (data) {
      should.exist(data.df);
      done();
    });
  });
});
