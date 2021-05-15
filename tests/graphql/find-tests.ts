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
    cleanUpCronJobsAndBusinessHours
} from './utilities/graphql-tests-utilities';

export async function runAllScalarFindTests(schemaAST: Readonly<SchemaAST>): Promise<void> {
    console.log(`\nSTARTING ALL FIND TEST AT 0 JOIN LEVELS`);

    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);

        await runScalarFindTest(tableName, schemaAST);
    }

    console.log(`\nALL FIND TEST PASSED AT 0 JOIN LEVELS`);
}

export async function runScalarFindTest(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARTING FIND TEST AT 0 JOIN LEVELS FOR TABLE '${tableName}'`);

    const createResult: any = await runScalarMutation('CREATE', tableName, schemaAST);
    const findResult: any = await runQuery('FIND', tableName, createResult, 0, schemaAST, 'id', createResult.id);

    console.log('createResult:', createResult);
    console.log('findResult:', findResult);

    const queryName: string = generateQueryName('FIND', tableName)
    verifyGQLResultsAreEquivalent(queryName, createResult, findResult.items[0]);

    console.log(`\nFIND TEST PASSED AT 0 JOIN LEVELS FOR TABLE '${tableName}'`);
}

export async function runALLFullFindTests(
    schemaAST: Readonly<SchemaAST>,
    joinLevels: number = 1,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY'
): Promise<void> {
    console.log(`\nSTARTING ALL FIND TESTS AT ${joinLevels} JOIN LEVEL(S)`);
    
    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);
    
        // if (isFindTestThatWillCauseHeapMemoryFailure(tableName, joinLevels) === true) {
        //     continue
        // }

        await runFullFindTest(
            tableName, 
            schemaAST, 
            joinLevels, 
            subSelectionSetLimit
        );
    }

    console.log(`\nALL FIND TESTS PASSED AT ${joinLevels} JOIN LEVEL(S)`);
}

export async function runFullFindTest(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>,
    joinLevels: number = 1,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY'
): Promise<void> {
    console.log(`\nSTARTING FIND TEST ON TABLE '${tableName}' AT ${joinLevels} JOIN LEVEL(S)`);

    const createResult: any = await runFullMutation(
        'CREATE', 
        tableName, 
        schemaAST, 
        joinLevels,
        subSelectionSetLimit
    );
    
    const findResult: any = await runQuery(
        'FIND', 
        tableName, 
        createResult.fullMutationResult.id, 
        joinLevels, 
        schemaAST, 
        'id', 
        createResult.fullMutationResult.id,
        subSelectionSetLimit
    );

    // console.log('\ncreateResult:', createResult.fullMutationResult);
    // console.log('findResult:', findResult.items[0]);

    const queryName: string = generateQueryName('FIND', tableName);

    verifyGQLResultsAreEquivalent(queryName, findResult.items[0], createResult.fullMutationResult);

    await cleanUpCronJobsAndBusinessHours();

    console.log(`\nFIND TEST PASSED ON TABLE '${tableName}' AT ${joinLevels} JOIN LEVEL(S)`);
}

function isFindTestThatWillCauseHeapMemoryFailure(
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