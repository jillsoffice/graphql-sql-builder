if (
    process.env.NODE_ENV !== 'development' ||
    process.env.JILLS_OFFICE_DATABASE_HOST === 'production.cilrulvl1eam.us-west-2.rds.amazonaws.com'
) {
    throw new Error('This must not run in production, all data will be erased!');
}

import * as fs from 'fs';
import {
    DocumentNode,
    parse
} from 'graphql';
import { generateModel } from '../../sql-builder-schema-generator';
import { postgresPromise } from '../../postgres/postgres';
import { defaultDirectiveTests } from './tests/default-directive';
import { createMutationTests } from './tests/create-mutation-tests';

// TODO waiting until i have implemented the create input before continuing with tests
// TODO having a create input will make some of this arbitraries much simpler to define
describe('GraphQL property-based tests', async () => {
    // await dropAllRowsInAllCustomTables();

    // before(async () => {
    //     // return await dropAllRowsInAllCustomTables();
    //     console.log('this runs before');
    // });    

    const modelSchema: string = fs.readFileSync('./graphql/schema.graphql').toString();
    const generatedModelSchema: string = generateModel(modelSchema);
    const documentNode: Readonly<DocumentNode> = parse(generatedModelSchema);
    
    // const numRuns: number = parseInt(process.env.NUM_RUNS || '10');
    const numRuns: number = 1;

    await createMutationTests(
        documentNode,
        numRuns
    );

    // await defaultDirectiveTests(
    //     documentNode,
    //     numRuns
    // );
});

async function dropAllRowsInAllCustomTables() {
    const postgres = await postgresPromise;
    
    const tableNamesResponse = await postgres.query({
        sql: `
            select table_name from information_schema.tables where table_schema='public'
        `
    });
    
    const tableNames = tableNamesResponse.filter((tableNameRow) => {
        return tableNameRow.table_name !== 'schema_migrations';
    }).map((tableNameRow) => {
        return tableNameRow.table_name;
    });

    if (tableNames.length > 0) {
        const truncateQuery = `truncate table ${tableNames.join(',')} restart identity`;
    
        const truncateResponse = await postgres.query({
            sql: truncateQuery
        });
    }
}