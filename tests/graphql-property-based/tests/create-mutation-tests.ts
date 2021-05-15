// @ts-nocheck

import * as fc from 'fast-check';
import {
    DocumentNode,
    ObjectTypeDefinitionNode
} from 'graphql';
import { graphqlPromise } from '../../../graphql/graphql';
import {
    getModelObjectTypeDefinitionNodes,
    getObjectTypeDefinitionNodesWithDefaultDirectives
} from '../../../graphql/utilities';
import { postgresPromise } from '../../../postgres/postgres';
import { GraphQLArbitraryInput, GraphQLArbitraryResult } from '../../../types';
import { getCreateMutationArbitrary } from '../arbitraries/create-mutation-arbitrary';

export async function createMutationTests(
    documentNode: Readonly<DocumentNode>,
    numRuns: number
) {
    const modelObjectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode> = getModelObjectTypeDefinitionNodes(documentNode.definitions);
    const modelObjectTypeDefinitionNodesWithDefaultDirectives: ReadonlyArray<ObjectTypeDefinitionNode> = [getObjectTypeDefinitionNodesWithDefaultDirectives(modelObjectTypeDefinitionNodes)[0]];
    // const modelObjectTypeDefinitionNodesWithDefaultDirectives: ReadonlyArray<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodesWithDefaultDirectives(modelObjectTypeDefinitionNodes);

    for (const objectTypeDefinitionNode of modelObjectTypeDefinitionNodesWithDefaultDirectives) {
        await createMutationTest(
            documentNode,
            objectTypeDefinitionNode,
            numRuns
        );
    }
}

async function createMutationTest(
    documentNode: Readonly<DocumentNode>,
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>,
    numRuns: number
) {
    const graphql = await graphqlPromise;
    const postgres = await postgresPromise;

    // TODO it should provide default values for create mutations, no inputs but required inputs
    // TODO Should we do the above? Or should we just have a random assortment of inputs?

    // TODO it should correctly execute mutations with relation inputs
    // TODO it should correctly execute mutations with scalar inputs and relation inputs
    // TODO we might want to just combine all of the different inputs into one test, and randomly select the inputs

    it('Should correctly execute mutations with scalar inputs', async () => {

        const createMutationArbitrary: fc.Arbitrary<GraphQLArbitraryResult> = await getCreateMutationArbitrary(
            documentNode,
            objectTypeDefinitionNode,
            'RELATION'
        );

        await fc.assert(fc.asyncProperty(createMutationArbitrary, async (arbitraryResultPromise: GraphQLArbitraryResult) => {

            const arbitraryResult = await arbitraryResultPromise();

            console.log(`arbitraryResult.query`, arbitraryResult.query);

            if (arbitraryResult.queryName.includes('Business_hours')) {
                await postgres.query({
                    sql: `
                        truncate table business_hours restart identity
                    `
                });
            }

            const result = await graphql.query(arbitraryResult.query);

            // if (Object.keys(arbitraryResult.inputs).length === 0) {
            //     return true;
            // }

            return Object.entries(arbitraryResult.inputs).every((inputEntry: [string, GraphQLArbitraryInput]) => {
                const inputKey: string = inputEntry[0];
                const inputValue = inputEntry[1];

                if (inputValue.type === 'Object') {
                    // TODO we need to do a nested check here
                }

                const outputValue: any = (result.data as any)[arbitraryResult.queryName][inputKey];

                return inputValue.value === outputValue;
            });
        }), {
            numRuns
        });
    });
}