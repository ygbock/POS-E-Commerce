import { parseExactMoney } from './server/inventory/inventoryPolicies';
console.log(parseExactMoney(12));
console.log(parseExactMoney(12.3));
console.log(parseExactMoney(12.30));
console.log(parseExactMoney(12.34));
try { console.log(parseExactMoney(12.345)); } catch (e) { console.log(e.message); }
try { console.log(parseExactMoney(12.999)); } catch (e) { console.log(e.message); }
try { console.log(parseExactMoney(-10)); } catch (e) { console.log(e.message); }
console.log(parseExactMoney(-10, 'cost', { allowNegative: true }));
