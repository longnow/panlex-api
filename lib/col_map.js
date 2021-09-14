module.exports = function finalizeColMap(mapCols, cols, table) {
  for (const col in mapCols) {
    const obj = mapCols[col];
    if (typeof obj === 'string') {
      mapCols[col] = {
        sqlExpr: obj,
        sqlExprAliased: needsAlias(obj, col) ? `${obj} as ${col}` : obj,
        sort: true,
      };
    }
    else if (!('sqlExprAliased' in obj)) {
      obj.sqlExprAliased = needsAlias(obj.sqlExpr, col) ? `${obj.sqlExpr} as ${col}` : obj.sqlExpr;
    }
  }

  cols.forEach(col => {
    if (!(col in mapCols)) {
      const sqlExpr = `${table}.${col}`;
      mapCols[col] = {
        sqlExpr: sqlExpr,
        sqlExprAliased: sqlExpr,
        sort: true,
      };
    }
  });

  return mapCols;
};

function needsAlias(sqlExpr, col) {
  return !(sqlExpr === col || sqlExpr.match(RegExp(`^${col}\\(|\\.${col}$`)));
}
