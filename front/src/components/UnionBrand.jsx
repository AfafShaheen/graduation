import React from 'react';
import '../style/UnionBrand.css';
import symbol from '../assets/union-symbol.png';
import { UNION_NAME } from '../config/brand';

// The union's coloured symbol with its name under it, typeset here in the brand font.
// Used on the first page and on the login page; the white symbol stays in the green headers.
export default function UnionBrand() {
  return (
    <div className="ub">
      <img className="ub-symbol" src={symbol} alt="" width="80" height="80" />
      <p className="ub-name">{UNION_NAME}</p>
    </div>
  );
}
