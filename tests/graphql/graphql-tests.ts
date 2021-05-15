// NOTE: leaving unused imports here to make them more convenient to use for future testing
import {
    SchemaAST,
    generateSchemaAST,
} from './utilities/schema-ast-util-object';
import {
    runAllScalarCreateTests,
    runFullCreateTest,
    runAllFullCreateTests
} from './create-tests';
import {
    runAllScalarUpdateTests, 
    runAllFullUpdateTests,
    runScalarUpdateTest, runFullUpdateTest
} from './update-tests';
import {
    runScalarGetTest,
    runAllScalarGetTests,
    runAllFullGetTests,
    runFullGetTest,
} from './get-tests';
import {
    runScalarFindTest,
    runAllScalarFindTests,
    runALLFullFindTests
} from './find-tests';
import {
    runTopLevelEQFilterTestOnFilterField,
    runSelectionSetEQFilterTest,
    runAllEQFilterTests,
    runTopLevelEQFilterTest,
    runAllTopLevelEQFilterTests,
    runAllEQSelectionSetFilterTests
} from './filter-tests';
import {
    runAllScalarDeleteTests,
    runAllJoinDeleteTests
} from './delete-tests';
import * as fc from 'fast-check';
import {
    runFullMutation,
    verifyFullMutationSucceeded,
    runScalarMutation,
    convertTypeDefNameToTableName, cleanUpCronJobsAndBusinessHours
} from './utilities/graphql-tests-utilities';
import {
    runTopLevelOrderByTestOnAllFieldsInTable,
    runTopLevelOrderByTestOnAllTables,
    runSelectionSetOrderByTestOnAllRelationFieldsForTable
} from './orderBy-tests';
import { JOTableName } from '../../types';
import { environmentVariablesPromise } from '../../utilities/environment-variables';


(async () => {
    const environmentVariables = await environmentVariablesPromise;
    if (environmentVariables.NODE_ENV === 'production') {
        throw new Error('graphql tests are not allowed to run in production');
    }
})();

/*
NOTE: 
    - to change the occurrence of null scalar values:
        - inside of the 'generateRandomValue' function:
            - go to the invocation of the 'returnValueOrNullOnBasedOnProbability' function

     
    - to set all nullable scalar test values to null:
        - set the 'probabilityDivisor' argument to 'ALL_NULLS' or 1

    - to set all nullable scalar test values to non-null values:
        - set the 'probabilityDivisor' argument to 'NO_NULLS'   

    - to set all nullable scalar test values to sometimes be null:
        - set the 'probabilityDivor' argument to some number
        - ex: 3 will mean there is a 1/3 chance of a value being null, 4 being 1/4, etc.
        - setting it to 1 will lead to a 100% chance that all values will be null, but recommended to use 'ALL_NULLS' instead
*/

(async () => {
    const schemaAST: Readonly<SchemaAST> = generateSchemaAST();

    await cleanUpCronJobsAndBusinessHours();


    // // // START CRUD TESTS


    // Create tests
    await runAllScalarCreateTests(schemaAST);
    await runAllFullCreateTests(schemaAST, 1, 'ID_ONLY');
    await runAllFullCreateTests(schemaAST, 1, 'ALL');
    await runAllFullCreateTests(schemaAST, 2, 'ID_ONLY');
    await runAllFullCreateTests(schemaAST, 2, 'ALL');
    


    // Update tests
    await runAllScalarUpdateTests(schemaAST);
    await runAllFullUpdateTests(schemaAST, 1, 'ID_ONLY');
    await runAllFullUpdateTests(schemaAST, 1, 'ALL');
    await runAllFullUpdateTests(schemaAST, 2, 'ID_ONLY');
    await runAllFullUpdateTests(schemaAST, 2, 'ALL');
   


    // Get tests
    await runAllScalarGetTests(schemaAST);
    await runAllFullGetTests(schemaAST, 1, 'ID_ONLY');
    await runAllFullGetTests(schemaAST, 1, 'ALL');
    await runAllFullGetTests(schemaAST, 2, 'ID_ONLY');
    await runAllFullGetTests(schemaAST, 2, 'ALL');
    



    // Find tests
    await runAllScalarFindTests(schemaAST)
    await runALLFullFindTests(schemaAST, 1, 'ID_ONLY');
    await runALLFullFindTests(schemaAST, 1, 'ALL');
    await runALLFullFindTests(schemaAST, 2, 'ID_ONLY');
    await runALLFullFindTests(schemaAST, 2, 'ALL');



    // // Delete tests
    await runAllScalarDeleteTests(schemaAST);
    await runAllJoinDeleteTests(schemaAST);

    
    // // END CRUD TESTS



    // // Filter tests  // NOTE these both only go to 1 join level
    await runAllTopLevelEQFilterTests(schemaAST);
    await runAllEQSelectionSetFilterTests(schemaAST);


    // OrderBy tests

    // 0 join levels
    await runTopLevelOrderByTestOnAllTables({
        limit: 10,
        order: 'ASC',
        joinLevels: 0
    }, schemaAST);

    await runTopLevelOrderByTestOnAllTables({
        limit: 10,
        order: 'DESC',
        joinLevels: 0
    }, schemaAST);

    // 1 join level
    await runTopLevelOrderByTestOnAllTables({
        limit: 10,
        order: 'ASC',
        joinLevels: 1
    }, schemaAST);

    await runTopLevelOrderByTestOnAllTables({
        limit: 10,
        order: 'DESC',
        joinLevels: 1
    }, schemaAST);







    //// LONG TESTS

    // // Create tests
    // await runAllFullCreateTests(schemaAST, 3, 'ID_ONLY');
    // // // // ----------------------------------------------------
    // // // // The following two will not pass until the treem column length issue is resolved
    // // // // await runAllFullCreateTests(schemaAST, 3, 'ALL'); // fails on createUsers, "Cannot return null for non-nullable field Companies.alerts_expiration_date."
    // // // // await runAllFullCreateTests(schemaAST, 4, 'ID_ONLY'); // fails on creatAction_items: "Cannot return null for non-nullable field Receptionist_services.id." NOTE: the gql query is over 1100 lines long
    // // // // ----------------------------------------------------


    // // Update tests
    // await runAllFullUpdateTests(schemaAST, 3, 'ID_ONLY');
    // // // // ----------------------------------------------------
    // // // // The following two will not pass until the treem column length issue is resolved
    // // // // await runAllFullUpdateTests(schemaAST, 3, 'ALL'); // fails on createUsers: "Cannot return null for non-nullable field Companies.alerts_expiration_date." NOTE: the gql query is over 1200 lines long
    // // // // await runAllFullUpdateTests(schemaAST, 4, 'ID_ONLY'); // fails on creatAction_items: "Cannot return null for non-nullable field Receptionist_services.id." NOTE: the gql query is over 1100 lines long
    // // // // ----------------------------------------------------


    // Get tests
    // await runAllFullGetTests(schemaAST, 3, 'ID_ONLY');
    // // // // ----------------------------------------------------
    // // // // The following two will not pass until the treem column length issue is resolved
    // // // // await runAllFullGetTests(schemaAST, 3, 'ALL'); // fails on createUsers: "Cannot return null for non-nullable field Companies.alerts_expiration_date." NOTE: the gql query is over 1200 lines long,  takes forever
    // // // // await runAllFullGetTests(schemaAST, 4, 'ID_ONLY'); // fails on creatAction_items: "Cannot return null for non-nullable field Receptionist_services.id." NOTE: the gql query is over 1100 lines long
    // // // // ----------------------------------------------------



    // Find tests
    // await runALLFullFindTests(schemaAST, 3, 'ID_ONLY');
    // // // ----------------------------------------------------
    // // // The following two will not pass until the treem column length issue is resolved
    // // // await runALLFullFindTests(schemaAST, 3, 'ALL');  // fails on createUsers: "Cannot return null for non-nullable field Companies.alerts_expiration_date." NOTE: the gql query is over 1200 lines long,  takes forever
    // // // await runALLFullFindTests(schemaAST, 4, 'ID_ONLY');  // fails on creatAction_items: "Cannot return null for non-nullable field Receptionist_services.id." NOTE: the gql query is over 1100 lines long
    // // // ----------------------------------------------------


    // Join Tests
    // // 2 join levels
    // NOTE: this test takes FOREVER, run it by itself later --- note: the limit being set 2 or 10 doesn't make much difference, its the get and find queries that take forever
    // await runTopLevelOrderByTestOnAllTables({
    //     limit: 5,
    //     order: 'ASC',
    //     joinLevels: 2,
    //     subSelectionSetFields: 'ALL'
    // }, schemaAST);

    // OrderBy tests
    // await runTopLevelOrderByTestOnAllTables({
    //     limit: 100,
    //     order: 'ASC',
    //     joinLevels: 0
    // }, schemaAST);

    // await runTopLevelOrderByTestOnAllTables({
    //     limit: 100,
    //     order: 'DESC',
    //     joinLevels: 0
    // }, schemaAST);



    

    console.log('\nAll tests passed, very nice');

})();