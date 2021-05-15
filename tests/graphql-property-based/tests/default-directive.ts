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
import { GraphQLArbitraryResult } from '../../../types';
import { getCreateMutationDefaultDirectiveArbitrary } from '../arbitraries/create-mutation-default-directive';

export async function defaultDirectiveTests(
    documentNode: Readonly<DocumentNode>,
    numRuns: number
) {
    const modelObjectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode> = getModelObjectTypeDefinitionNodes(documentNode.definitions);
    const modelObjectTypeDefinitionNodesWithDefaultDirectives: ReadonlyArray<ObjectTypeDefinitionNode> = [getObjectTypeDefinitionNodesWithDefaultDirectives(modelObjectTypeDefinitionNodes)[0]];

    for (const objectTypeDefinitionNode of modelObjectTypeDefinitionNodesWithDefaultDirectives) {
        await defaultDirectiveTest(
            documentNode,
            objectTypeDefinitionNode,
            numRuns
        );
    }
}

async function defaultDirectiveTest(
    documentNode: Readonly<DocumentNode>,
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>,
    numRuns: number
) {
    const graphql = await graphqlPromise;

    // TODO it should provide default values for create mutations, no inputs but required inputs
    // TODO Should we do the above? Or should we just have a random assortment of inputs?

    it('Should provide default values for create mutations', async () => {

        const defaultDirectiveCreateMutationArbitrary: fc.Arbitrary<GraphQLArbitraryResult> = await getCreateMutationDefaultDirectiveArbitrary(
            documentNode,
            objectTypeDefinitionNode
        );

        await fc.assert(fc.asyncProperty(defaultDirectiveCreateMutationArbitrary, async (arbitraryResult: GraphQLArbitraryResult) => {

            console.log(`arbitraryResult.query`, arbitraryResult.query);

            const result = await graphql.query(arbitraryResult.query);

            if (Object.keys(arbitraryResult.inputs).length === 0) {
                return true;
            }

            return Object.entries(arbitraryResult.inputs).every((inputEntry) => {
                const inputKey: string = inputEntry[0];
                const inputValue: any = inputEntry[1];

                const outputValue: any = (result.data as any)[arbitraryResult.queryName][inputKey];

                return inputValue === outputValue;
            });
        }), {
            numRuns
        });
    });
}