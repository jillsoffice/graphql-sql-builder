// @ts-nocheck

import { JOTableName } from '../../types.d';
import { SchemaAST } from './utilities/schema-ast-util-object';
import {
    generateQueryName,
    runQuery,
    runScalarMutation,
    convertTypeDefNameToTableName,
    runFullMutation,
    verifyGQLResultsAreEquivalent,
    cleanUpCronJobsAndBusinessHours,
    runDeleteMutation
} from './utilities/graphql-tests-utilities';

export async function runAllScalarGetTests(schemaAST: Readonly<SchemaAST>): Promise<void> {
    console.log(`\nSTARTING ALL GET TESTS AT ZERO JOIN LEVELS`);
    
    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);

        await runScalarGetTest(tableName, schemaAST, 0);
    }
    
    console.log(`\nALL GET TESTS PASSED AT ZERO JOIN LEVELS`);
}

export async function runScalarGetTest(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>,
    joinLevels: number = 0
): Promise<void> {
    console.log(`\nSTARTING GET TEST ON TABLE '${tableName}' AT ${joinLevels} JOIN LEVEL${joinLevels === 1 ? '' : 'S'}`);

    const createResult: any = await runScalarMutation('CREATE', tableName, schemaAST);
    const getResult: any = await runQuery('GET', tableName, createResult.id, joinLevels, schemaAST);

    const queryName: string = generateQueryName('GET', tableName);
    await verifyGQLResultsAreEquivalent(queryName, createResult, getResult);

    await runDeleteMutation(tableName, createResult.id);

    console.log(`\nGET TEST ON TABLE '${tableName}' PASSED AT ${joinLevels} JOIN LEVEL${joinLevels === 1 ? '' : 'S'}`);
}

export async function runAllFullGetTests(
    schemaAST: Readonly<SchemaAST>,
    joinLevels: number,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY'
): Promise<void> {
    console.log(`\nSTARTING ALL FULL GET TESTS AT ${joinLevels} JOIN LEVEL(S)`);

    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);

        if (
            tableName === 'redacted' ||
            tableName === 'redacted'
        ) {
            // we skip these because A) they don't have joins and B) they mess up the tests 
            continue;
        }

        // if (isGetTestThatWillCauseHeapMemoryFailure(tableName, joinLevels) === true) {
        //     continue;
        // }

        await runFullGetTest(tableName, schemaAST, joinLevels, subSelectionSetLimit);
    }

    console.log(`\nALL FULL GET TESTS PASSED AT ${joinLevels} JOIN LEVEL(S)`);
}



export async function runFullGetTest(
    tableName: Readonly<JOTableName>, 
    schemaAST: Readonly<SchemaAST>, 
    joinLevels: number = 1,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY'
): Promise<void> {
    console.log(`\nSTARTING FULL GET TEST ON TABLE '${tableName}' at ${joinLevels} JOIN LEVEL(S)`);
 
    const createResult: any = await runFullMutation(
        'CREATE', 
        tableName, 
        schemaAST, 
        joinLevels,
        subSelectionSetLimit
    );
    
    const getResult: any = await runQuery(
        'GET', 
        tableName, 
        createResult.mutationResultId, 
        joinLevels, 
        schemaAST,
        'NOT_FIND_QUERY',
        'NOT_FIND_QUERY',
        subSelectionSetLimit
    );

    console.log('\nCREATE Result', createResult.fullMutationResult);
    console.log('\nGET Result:', JSON.stringify(getResult, null, 2));

    const queryName: string = generateQueryName('GET', tableName);
    verifyGQLResultsAreEquivalent(queryName, getResult, createResult.fullMutationResult);

    await cleanUpCronJobsAndBusinessHours();
    
    console.log(`\nFULL GET TEST PASSED ON TABLE '${tableName}' at ${joinLevels} JOIN LEVEL(S)`);
}


// TODO add more cases as we find them
function isGetTestThatWillCauseHeapMemoryFailure(
    tableName: Readonly<JOTableName>,
    joinLevels: number
): boolean {
    // if (
    //     joinLevels === 2 &&
    //     (
    //         tableName === 'redacted' ||
    //         tableName === 'redacted' ||
    //         tableName === 'redacted'
    //     )
    // ) {
    //     return true;
    // }

    // TODO perhaps vet through 3 join levels? 

   
    return false;
}