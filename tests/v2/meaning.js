const query = require('../query');
const should = require('should');
const config = require('../../config');

describe('meaning', function () {
  it('get matching', function (done) {
    query('/v2/meaning', { id: [19784863] }, done,
    function (data) {
      should.exist(data.result);
      data.result.length.should.equal(1);
      (data.result.some (function (i) { return i.source === 703 })).should.be.true;
      done();
    });
  });

  it('get matching with all fields', function (done) {
    query('/v2/meaning', { id: [19784863], include: ["meaning_class","meaning_prop","definition"] }, done,
    function (data) {
      should.exist(data.result);
      data.result.length.should.equal(1);
      data.result[0].source.should.equal(703);
      (data.result[0].meaning_class.some(function (i) { return i[1] === 60703 })).should.be.true;
      (data.result[0].meaning_prop.some(function (i) { return i[1] === "860" })).should.be.true;
      (data.result[0].definition.some(function (i) { return i.tt === "arbre de baobab" })).should.be.true;
      done();
    });
  });

  it('url param id', function (done) {
    query('/v2/meaning/19784863', {}, done,
    function (data) {
      should.exist(data.meaning);
      data.meaning.source.should.equal(703);
      done();
    });
  });

  it('all params', function (done) {
    query('/v2/meaning', {
        expr: 100,
        id: [1,2,3],
        include: ['definition', 'meaning_class', 'meaning_prop'],
        meaning_class: [[5,5], [5,null], [null,5]],
        meaning_prop: [[5,null], [5,'foo']],
        source: 10,
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('url param with include', function (done) {
    query('/v2/meaning/187', {
        include: ['definition', 'meaning_class', 'meaning_prop'],
    },
    done,
    function (data) {
      should.exist(data.meaning);
      done();
    });
  });
});
