// @ts-nocheck

import fc from 'fast-check';
import {
    DocumentNode,
    FieldDefinitionNode,
    ObjectTypeDefinitionNode
} from 'graphql';
import {
    getDirectiveArgumentValue,
    getDirectiveWithArgument,
    getTypeNameFromTypeNode,
    isFieldDefinitionNodeASingleRelation,
    isTypeNameARelation
} from '../../../graphql/utilities';
import { GraphQLArbitraryResult } from '../../../types/index.d';

export async function getCreateMutationDefaultDirectiveArbitrary(
    documentNode: Readonly<DocumentNode>,
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>
): Promise<fc.Arbitrary<GraphQLArbitraryResult>> {
    // TODO we probably want to do a random assortment of input values actually
    // TODO do an arbitrary that randomly changes how many inputs are present
    // TODO we probably want to also randomly include and exclude the default values...
    // TODO should we have separate tests for each of these cases? I'm thinking yes, one property is one test

    // TODO start with scalars, but include relations as well
    // TODO to include relations, we'll need a way of creating a random value to use
    // TODO we also probably want to clean the database each time
    // TODO might be best to start with create the creatMutation arbitrary
    const fieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = objectTypeDefinitionNode.fields?.filter((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
        return (
            getDirectiveWithArgument(fieldDefinitionNode, 'db', 'default') === undefined &&
            fieldDefinitionNode.name.value !== 'id'
        );
    }) || [];

    const queryName: string = `create${objectTypeDefinitionNode.name.value}`;

    // TODO I think we actually need inputs and outputs to be returned
    // TODO in the case of the defaults, we do not want them including in the input values
    // TODO but we do need the required relations to be involved in the requried values, every time
    // TODO but we want the default values of the default directives field definition nodes to be included in the outputs
    const inputs: GraphQLArbitraryResult['inputs'] = fieldDefinitionNodes.reduce((result, fieldDefinitionNode) => {
        const key: string = fieldDefinitionNode.name.value;
        const value: any = getDirectiveArgumentValue(fieldDefinitionNode, 'db', 'default'); // TODO we probably need to parse the type here
        
        return {
            ...result,
            [key]: value
        };
    }, {});

    const requiredSingleRelationFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = objectTypeDefinitionNode.fields?.filter((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
        return (
            isFieldDefinitionNodeASingleRelation(
                documentNode,
                fieldDefinitionNode
            ) === true &&
            fieldDefinitionNode.type.kind === 'NonNullType'
        );
    }) || [];

    // return new fc.Arbitrary();

    // TODO try to figure this out better...I do not think this will shrink appropriately
    // TODO because we are not really deriving our values from it
    // TODO we just have to extend the fc.Arbitrary in a custom class, that should give us exactly what we want if the below is not good enough
    return fc.boolean().map((arbBool: boolean) => {
        return {
            query: `
                mutation {
                    ${queryName}(input: {}) {
                        id
                        ${Object.keys(inputs).map((inputKey: string) => {
                            return inputKey;
                        }).join('\n')}
                    }
                }
            `,
            queryName,
            inputs
        };
    });
}