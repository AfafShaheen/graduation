import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EMPTY_FILTERS,
  buildRosterFilterQuery,
  REGISTRATION_OPTIONS,
  TOP_OPTIONS,
  TICKET_OPTIONS,
  PAYMENT_OPTIONS,
  ENTRY_OPTIONS,
  TICKET_TYPE_OPTIONS,
  PAGE_SIZES,
} from '../src/utils/roster.js';

// Guards the front/back agreement of the roster page: the parameter names and
// every filter value the page can send must exist in the committed API contract.
const contractUrl = new URL('../../back/tests/contract/openapi_baseline.json', import.meta.url);
const available = fs.existsSync(contractUrl);
const skip = available ? false : 'the backend contract file is not next to the frontend';

const operation = () =>
  JSON.parse(fs.readFileSync(contractUrl, 'utf-8')).paths['/api/admin/roster'].get;

const params = () =>
  Object.fromEntries(operation().parameters.filter((p) => p.in === 'query').map((p) => [p.name, p]));

const allowed = (param) => {
  const schema = param.schema || {};
  const variants = schema.anyOf || [schema];
  return variants.flatMap((v) => v.enum || []);
};

test('every filter the page sends is a query parameter of the API', { skip }, () => {
  const everything = Object.fromEntries(Object.keys(EMPTY_FILTERS).map((k) => [k, 'x']));
  const names = Object.keys(buildRosterFilterQuery(everything));
  const known = params();
  names.forEach((name) => assert.ok(known[name], `API has no query parameter "${name}"`));
  assert.ok(known.skip && known.limit, 'API must accept skip and limit');
});

test('every option value of the filter lists is accepted by the API', { skip }, () => {
  const known = params();
  const pairs = [
    ['registration', REGISTRATION_OPTIONS],
    ['top_rank', TOP_OPTIONS],
    ['ticket', TICKET_OPTIONS],
    ['payment', PAYMENT_OPTIONS],
    ['entry', ENTRY_OPTIONS],
    ['ticket_type', TICKET_TYPE_OPTIONS],
  ];
  pairs.forEach(([name, options]) => {
    const accepted = allowed(known[name]);
    assert.ok(accepted.length > 0, `API parameter "${name}" has no enum`);
    options.forEach((o) => assert.ok(accepted.includes(o.value), `"${name}" does not accept "${o.value}"`));
    // ...and the page offers every value the API knows.
    accepted.forEach((v) => assert.ok(options.some((o) => o.value === v), `page misses "${name}=${v}"`));
  });
});

test('page sizes stay inside the limit the API allows', { skip }, () => {
  const limit = params().limit.schema;
  PAGE_SIZES.forEach((size) => {
    assert.ok(size >= (limit.minimum ?? 1), `page size ${size} is below the API minimum`);
    assert.ok(size <= (limit.maximum ?? 200), `page size ${size} exceeds the API maximum`);
  });
});
