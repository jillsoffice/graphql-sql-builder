import { JOTableName } from '../../types.d';
import { SchemaAST } from './utilities/schema-ast-util-object';
import {
    generateQueryName,
    convertTypeDefNameToTableName,
    runDeleteMutation,
    runScalarMutation,
    verifyFullMutationSucceeded,
    runFullMutation,
    cleanUpCronJobsAndBusinessHours
} from './utilities/graphql-tests-utilities';

export async function runAllScalarCreateTests(schemaAST: Readonly<SchemaAST>) {
    console.log(`\nSTARTING All SCALAR CREATE TESTS (SCALAR FIELDS ONLY)...`);

    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);

        const createResult: any = await runScalarMutation('CREATE', tableName, schemaAST);
        await runDeleteMutation(tableName, createResult.id);
    }

    console.log(`\nAll SCALAR CREATE TESTS (SCALAR FIELDS ONLY) PASSED`);
}

export async function runScalarCreateTest(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARING SCALAR CREATE TEST ON TABLE '${tableName}`);

    const createResult: any = await runScalarMutation('CREATE', tableName, schemaAST);
    await runDeleteMutation(tableName, createResult.id);

    console.log(`\nSCALAR CREATE TEST PASSED ON TABLE '${tableName}'`);
}

export async function runAllFullCreateTests(
    schemaAST: Readonly<SchemaAST>,
    joinLevels: number = 1,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL'
): Promise<void> {
    console.log(`\nSTARTING ALL CREATE TESTS AT ${joinLevels} JOIN LEVELS...`);

    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);

        // if (
        //     tableName === 'redacted' ||
        //     tableName === 'redacted' || 
        //     tableName === 'redacted'
        // ) {
        //     // we don't need to test these, because A) they only have scalar values and so the scalar tests are sufficient, and B) becuase they cause problems here due to unique column constraints
        //     continue;
        // }
        
        await runFullCreateTest(tableName, schemaAST, joinLevels, subSelectionSetLimit);

        // We clean up redacted and redacted because:
        // 1) having them in the database causes problems for the tests due to unique enum column constrains
        // 2) they don't have foreign key constraints and so we can use a simple delete gql query
        await cleanUpCronJobsAndBusinessHours();
    }

    console.log(`\nAll CREATE TESTS AT ${joinLevels} JOIN LEVELS PASSED`);
}

export async function runFullCreateTest(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>,
    joinLevels: number = 1,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL'
): Promise<void> {
    console.log(`\nSTARTING CREATE TEST AT ${joinLevels} JOIN LEVEL(S) for TABLE '${tableName}'`);

    const createMutationName: string = generateQueryName('CREATE', tableName);

    const {
        fullMutationResult,
        scalarFieldInitialValues,
        relationshipFieldInitialValues
    } 
    = await runFullMutation(
        'CREATE', 
        tableName, 
        schemaAST, 
        joinLevels, 
        subSelectionSetLimit
    );

    verifyFullMutationSucceeded(
        createMutationName, 
        scalarFieldInitialValues, 
        relationshipFieldInitialValues, 
        fullMutationResult,
        subSelectionSetLimit
    );

    console.log(`\nCREATE TEST AT ${joinLevels} JOIN LEVEL(S) PASSED for TABLE '${tableName}'`);
}