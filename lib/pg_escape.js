// make whitespace properly formatted for COPY
module.exports = function pgEscape(item) {
  return item
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
};