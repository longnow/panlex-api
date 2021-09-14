const query = require('../query');
const should = require('should');
const config = require('../../config');

describe('ap', function () {
  it('all', function (done) {
    query('/ap', {}, done,
    function (data) {
      should.exist(data.result);
      data.result.length.should.equal(config.limit.responseMax);
      done();
    });
  });

  it('matching by id', function (done) {
    query('/ap', {ap: [100,101,102,3594]}, done,
    function (data) {
      should.exist(data.result);
      data.result.length.should.equal(4);
      done();
    });
  });

  it('matching by label', function (done) {
    query('/ap', {tt: ["art-eng-mul:Wichmann"]}, done,
    function (data) {
      should.exist(data.result);
      data.result.length.should.equal(1);
      done();
    });
  });

  it('url param id', function (done) {
    query('/ap/3594', {}, done,
    function (data) {
      should.exist(data.ap);
      data.ap.tt.should.equal("art-eng-mul:Wichmann");
      done();
    });
  });

  it('url param label', function (done) {
    query('/ap/art-eng-mul:Wichmann', {}, done,
    function (data) {
      should.exist(data.ap);
      data.ap.ap.should.equal(3594);
      done();
    });
  });

  it('all params 1', function (done) {
    query('/ap', {
        ex: 100,
        fm: 'mul@IA',
        ui: 50,
        ap: [1,2,3],
        include: ['dncount', 'fm', 'lv', 'lv_attested', 'mncount', 'us'],
        tt: 'art:PanLex',
        lv: 187,
        mn: true,
        uid: 'ind-000',
        us: 'kamholz',
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('all params 2', function (done) {
    query('/ap', {
        fm: 'mul@IA',
        ui: 50,
        ap: [1,2,3],
        include: ['dncount', 'fm', 'lv', 'lv_attested', 'mncount', 'us'],
        tt: 'art:PanLex',
        lv: 187,
        mn: true,
        trex: 300,
        uid: 'ind-000',
        us: 'kamholz',
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('url param with include', function (done) {
    query('/ap/187', {
        include: ['dncount', 'fm', 'lv', 'lv_attested', 'mncount', 'us'],
    },
    done,
    function (data) {
      should.exist(data.ap);
      done();
    });
  });
});
