// 1 + 2 === 2 + 1
// operand 1: x
// operand 2: y
// operator: +
// x + y === y + x
// import * as fc from 'fast-check';

// (async () => {
//     fc.assert(fc.property(fc.integer(), fc.integer(), (int1: number, int2: number) => {

//         console.log('int1', int1);
//         console.log('int2', int2);
//         console.log();

//         return int1 + int2 === int2 + int1;
//     }), {
//         numRuns: 1000000
//     });
// })();