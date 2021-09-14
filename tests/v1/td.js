const query = require('../query');
const should = require('should');
const config = require('../../config');

describe('td', function () {
  it('basic', function (done) {
    const str = '!@#!@#&(*&*(BLÁH!@#*@!#@*(';
    query('/td', { tt: str }, done,
    function (data) {
      should.exist(data.td);
      should.exist(data.td[str]);
      data.td[str].should.equal('blah');
      done();
    });
  });
});
