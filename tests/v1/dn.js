const query = require('../query');
const should = require('should');

describe('dn', function () {
  it('get matching', function (done) {
    query('/dn', { ex: [441285, 600704], include: 'dcs' }, done,
    function (data) {
      should.exist(data.result);
      (data.result.some(function (i) { return i.dcs.length && i.dcs[0][1] === 22080029 })).should.be.true;
      done();
    });
  });

  it('all params', function (done) {
    query('/dn', {
        dcs: [[5, 5], [null, 5], [5, null]],
        dpp: [[5, 'bar'], [5, null]],
        ex: 2,
        dn: [1,2,3],
        include: ['dcs','dpp'],
        lv: 666,
        mn: 3,
        ap: 2,
        uid: ['spa-000','eng-000'],
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('url param with include', function (done) {
    query('/dn/100297066', {
        include: ['dcs','dpp'],
    },
    done,
    function (data) {
      should.exist(data.dn);
      done();
    });
  });
});
