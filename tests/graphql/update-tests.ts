import { JOTableName } from '../../types.d';
import { SchemaAST } from './utilities/schema-ast-util-object';
import {
    generateQueryName,
    convertTypeDefNameToTableName,
    runDeleteMutation,
    runScalarMutation,
    runFullMutation,
    verifyFullMutationSucceeded,
    cleanUpCronJobsAndBusinessHours
} from './utilities/graphql-tests-utilities';

export async function runAllScalarUpdateTests(schemaAST: Readonly<SchemaAST>): Promise<void> {
    console.log(`\nSTARTING ALL SCALAR UPDATE TESTS...`);

    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);

        await runScalarUpdateTest(tableName, schemaAST);
    }

    console.log(`\nALL SCALAR UPDATE TESTS PASSED`);
}

export async function runScalarUpdateTest(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARTING SCALAR UPATE TEST ON TABLE '${tableName}'`);

    const createResult: any = await runScalarMutation('CREATE', tableName, schemaAST);
    await runScalarMutation('UPDATE', tableName, schemaAST, createResult.id);
    await runDeleteMutation(tableName, createResult.id);

    console.log(`\nSCALAR UPATE TEST PASSED ON TABLE '${tableName}'`);
}

export async function runAllFullUpdateTests(
    schemaAST: Readonly<SchemaAST>, 
    joinLevels: number = 1,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL'
): Promise<void> {
    console.log(`\nSTARTING ALL FULL UPDATE TESTS AT ${joinLevels} JOIN LEVEL(S)...`);

    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);

        if (
            tableName === 'redacted' ||
            tableName === 'redacted'
        ) {
            // we don't need to test these, because A) they only have scalar values and so the scalar tests are sufficient, and B) becuase they cause problems here due to unique column constraints
            continue;
        }

        await runFullUpdateTest(tableName, schemaAST, joinLevels, subSelectionSetLimit);
        
        // We clean up redacted and redacted because:
        // 1) having them in the database causes problems for the tests due to unique enum column constrains
        // 2) they don't have foreign key constraints and so we can use a simple delete gql query
        await cleanUpCronJobsAndBusinessHours();
    }

    console.log(`\nALL UPDATE TESTS AT ${joinLevels} JOIN LEVEL(S) PASSED`);
}

export async function runFullUpdateTest(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>,
    joinLevels: number = 1,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL'
): Promise<void> {
    console.log(`\nSTARTING FULL UPDATE TEST AT ${joinLevels} JOIN LEVEL(S) FOR TABLE '${tableName}'`);

    // await runFullUpdateTestOnScalarCreateResult(tableName, schemaAST, joinLevels, subSelectionSetLimit);
    
    await runFullUpdateTestOnFullCreateResult(tableName, schemaAST, joinLevels, subSelectionSetLimit);
    
    console.log(`\nFULL UPDATE TEST AT ${joinLevels} JOIN LEVEL(S) PASSED for TABLE '${tableName}'`);

    await cleanUpCronJobsAndBusinessHours();
}

export async function runFullUpdateTestOnScalarCreateResult(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>,
    joinLevels: number = 1,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL'
): Promise<void> {
    console.log(`\nSTARTING FULL UPDATE TEST ON SCALAR CREATE RESULT for TABLE '${tableName}'`)

    const scalarCreateResult: any = await runScalarMutation('CREATE', tableName, schemaAST);
    

    const {
        fullMutationResult,
        scalarFieldInitialValues,
        relationshipFieldInitialValues
    } = await runFullMutation(
        'UPDATE', 
        tableName, 
        schemaAST, 
        joinLevels, 
        subSelectionSetLimit,
        scalarCreateResult.id
    );
    
    const updateMutationName: string = generateQueryName('UPDATE', tableName);
    await verifyFullMutationSucceeded(
        updateMutationName, 
        scalarFieldInitialValues, 
        relationshipFieldInitialValues, 
        fullMutationResult,
        subSelectionSetLimit
    );

    console.log(`\nFULL UPDATE TEST ON SCALAR CREATE RESULT PASSED for TABLE '${tableName}'`)
}

export async function runFullUpdateTestOnFullCreateResult(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>,
    joinLevels: number = 1,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL'
): Promise<void> {
    console.log(`\nSTARTING FULL UPDATE TEST ON FULL CREATE RESULT for TABLE '${tableName}' AT ${joinLevels} JOIN LEVELS`);
    
    // first create a full create result of this type, return its id
    const fullCreateResult: any = await runFullMutation('CREATE', tableName, schemaAST, joinLevels, subSelectionSetLimit);

    
    // now test a full update mutation on that create result
    const {
        fullMutationResult,
        scalarFieldInitialValues,
        relationshipFieldInitialValues
    } = await runFullMutation(
        'UPDATE', 
        tableName, 
        schemaAST, 
        joinLevels, 
        subSelectionSetLimit,
        fullCreateResult.mutationResultId
    );
    
    const updateMutationName: string = generateQueryName('UPDATE', tableName);
    verifyFullMutationSucceeded(
        updateMutationName, 
        scalarFieldInitialValues, 
        relationshipFieldInitialValues, 
        fullMutationResult,
        subSelectionSetLimit,
    );

    console.log(`\nFULL UPDATE TEST ON FULL CREATE RESULT PASSED for TABLE '${tableName}' AT ${joinLevels} JOIN LEVELS`);
}