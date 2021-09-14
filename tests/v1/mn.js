const query = require('../query');
const should = require('should');
const config = require('../../config');

describe('mn', function () {
  it('get matching', function (done) {
    query('/mn', { mn: [19784863] }, done,
    function (data) {
      should.exist(data.result);
      data.result.length.should.equal(1);
      (data.result.some (function (i) { return i.ap === 703 })).should.be.true;
      done();
    });
  });

  it('get matching with all fields', function (done) {
    query('/mn', { mn: [19784863], include: ["mcs","mpp","df"] }, done,
    function (data) {
      should.exist(data.result);
      data.result.length.should.equal(1);
      data.result[0].ap.should.equal(703);
      (data.result[0].mcs.some(function (i) { return i[1] === 60703 })).should.be.true;
      (data.result[0].mpp.some(function (i) { return i[1] === "860" })).should.be.true;
      (data.result[0].df.some(function (i) { return i.tt === "arbre de baobab" })).should.be.true;
      done();
    });
  });

  it('url param id', function (done) {
    query('/mn/19784863', {}, done,
    function (data) {
      should.exist(data.mn);
      data.mn.ap.should.equal(703);
      done();
    });
  });

  it('all params', function (done) {
    query('/mn', {
        ex: 100,
        mn: [1,2,3],
        include: ['df', 'mcs', 'mpp'],
        mcs: [[5,5], [5,null], [null,5]],
        mpp: [[5,null], [5,'foo']],
        ap: 10,
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('url param with include', function (done) {
    query('/mn/187', {
        include: ['df', 'mcs', 'mpp'],
    },
    done,
    function (data) {
      should.exist(data.mn);
      done();
    });
  });
});
