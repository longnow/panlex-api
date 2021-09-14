const query = require('../query');
const should = require('should');
const config = require('../../config');

describe('txt_degr', function () {
  it('basic', function (done) {
    const str = '!@#!@#&(*&*(BLÁH!@#*@!#@*(';
    query('/v2/txt_degr', { txt: str }, done,
    function (data) {
      should.exist(data.txt_degr);
      should.exist(data.txt_degr[str]);
      data.txt_degr[str].should.equal('blah');
      done();
    });
  });
});
