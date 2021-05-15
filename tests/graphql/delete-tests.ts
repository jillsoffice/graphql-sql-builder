import { JOTableName } from '../../types.d';
import { SchemaAST } from './utilities/schema-ast-util-object';
import { 
    runScalarMutation, 
    runDeleteMutation,
    convertTypeDefNameToTableName,
    runFullMutation
} from './utilities/graphql-tests-utilities';

export async function runAllScalarDeleteTests(schemaAST: Readonly<SchemaAST>): Promise<void> {
    console.log(`\nSTARTING ALL SCALAR DELETE TESTS`);

    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);

        await runScalarDeleteTest(tableName, schemaAST);
    }

    console.log(`\nALL SCALAR DELETE TESTS PASSED`);
}

export async function runAllJoinDeleteTests(schemaAST: Readonly<SchemaAST>): Promise<void> {
    console.log(`\nSTARTING ALL JOIN DELETE TESTS`);
    
    let joinDeleteFailures: Array<string> = [];
    let joinDeleteSuccesses: Array<string> = [];

    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);

        try {
            await runJoinDeleteTest(tableName, schemaAST);
        }
        catch(error) {
            joinDeleteFailures.push(tableName);
            console.log('error in join delete test:', error);
            continue;
        }

        joinDeleteSuccesses.push(tableName);
    }

    if (joinDeleteFailures.length > 0) {
        console.log('\nJOIN DELETE TESTS PASSED FOR THE FOLLOWING TABLES:', joinDeleteSuccesses);
        console.log('JOIN DELETE TESTS FAILED FOR THE FOLLOWING TABLES:', joinDeleteFailures);
    }
    else {
        console.log(`\nALL JOIN DELETE TESTS PASSED`);
    }
}


export async function runScalarDeleteTest(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARTING SCALAR DELETE TEST FOR TABLE '${tableName}'`);

    const createResult: any = await runScalarMutation('CREATE', tableName, schemaAST);
    await runDeleteMutation(tableName, createResult.id);

    console.log(`\nSCALAR DELETE TEST PASSED FOR TABLE '${tableName}'`);
}

export async function runJoinDeleteTest(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARTING JOIN DELETE TEST FOR TABLE '${tableName}'`);

    const createResult: any = await runFullMutation('CREATE', tableName, schemaAST);
    await runDeleteMutation(tableName, createResult.fullMutationResult.id);

    console.log(`\nSCALAR JOIN DELETE TEST PASSED FOR TABLE '${tableName}'`);
}