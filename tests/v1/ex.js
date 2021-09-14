const query = require('../query');
const should = require('should');

describe('ex', function () {
  it('count', function (done) {
    query('/ex/count', { uid: ["rus-000"] }, done,
    function (data) {
      should.exist(data.count);
      should.exist(data.countType);
      data.countType.should.equal('ex');
      done();
    });
  });

  it('get English "ideal"', function (done) {
    query('/ex', { uid: ["eng-000"], tt: ["ideal"] }, done,
    function (data) {
      should.exist(data.result);
      should.exist(data.result[0]);
      data.result[0].lv.should.equal(187);
      data.result[0].ex.should.equal(441285);
      done();
    });
  });

  it('translate "ideal" into Italian', function (done) {
    query('/ex', { trex: [441285], uid: ["ita-000"] }, done,
    function (data) {
      should.exist(data.result);
      should.exist(data.result[0]);
      data.result[0].lv.should.equal(304);
      data.result[0].ex.should.equal(70025);
      data.result[0].trex.should.equal(441285);
      done();
    });
  });

  it('url param id', function (done) {
    query('/ex/441285', done,
    function (data) {
      should.exist(data.ex);
      data.ex.ex.should.equal(441285);
      done();
    });
  });

  it('all params distance-1', function (done) {
    query('/ex', {
        ex: [1,2,3],
        include: ['trlv', 'trpath', 'trq', 'trtt', 'trtd', 'truid', 'uid'],
        lc: 'ind',
        lv: 187,
        mu: true,
        range: ['tt', 'a', 'b'],
        trdistance: 1,
        trex: 100,
        trui: 5,
        trlv: 666,
        trqmin: 1,
        trap: 0,
        trtt: 'blah',
        trtd: 'foo',
        truid: 'deu-000',
        tt: 'hello',
        td: 'something',
        uid: ['eng-000','spa-000'],
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('all params distance-2a', function (done) {
    query('/ex', {
        ex: [1,2,3],
        include: ['trlv', 'trpath', 'trq', 'trtt', 'trtd', 'truid', 'uid'],
        im1exlv: 187,
        im1exuid: 'eng-000',
        im1ui: 5,
        im1ap: 5,

        lc: 'ind',
        lv: 187,
        mu: true,
        range: ['tt', 'a', 'b'],
        trdistance: 2,
        trex: 100,
        trui: 5,
        trlv: 666,
        trqalgo: 'geometric',
        trqmin: 1,
        trap: 0,
        trtt: 'blah',
        trtd: 'foo',
        truid: 'deu-000',
        tt: 'hello',
        td: 'something',
        uid: ['eng-000','spa-000'],
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

it('all params distance-2b', function (done) {
    query('/ex', {
        ex: [1,2,3],
        include: ['trlv', 'trpath', 'trq', 'trtt', 'trtd', 'truid', 'uid'],
        im1exlv: 187,
        im1exuid: 'eng-000',
        im1ui: 5,
        im1ap: 5,

        lc: 'ind',
        lv: 187,
        mu: true,
        range: ['tt', 'a', 'b'],
        trdistance: 2,
        trex: 100,
        trui: 5,
        trlv: 666,
        trqalgo: 'arithmetic',
        trqmin: 1,
        trap: 0,
        trtt: 'blah',
        trtd: 'foo',
        truid: 'deu-000',
        tt: 'hello',
        td: 'something',
        uid: ['eng-000','spa-000'],
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('url param with include', function (done) {
    query('/ex/5', {
        include: ['uid'],
    },
    done,
    function (data) {
      should.exist(data.ex);
      done();
    });
  });

  it('index', function (done) {
    query('/ex/index', {
        uid: 'mhz-000',
        step: 250,
    },
    done,
    function (data) {
      should.exist(data.index);
      done();
    });
  });
});
