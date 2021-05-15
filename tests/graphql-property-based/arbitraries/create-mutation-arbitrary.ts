// @ts-nocheck

import fc from 'fast-check';
import {
    DocumentNode,
    FieldDefinitionNode,
    isNullableType,
    ObjectTypeDefinitionNode
} from 'graphql';
import {
    getDirectiveArgumentValue,
    getDirectiveWithArgument,
    getTypeNameFromTypeNode,
    isFieldDefinitionNodeARelation,
    isFieldDefinitionNodeASingleRelation
} from '../../../graphql/utilities';
import { GraphQLArbitraryInput, GraphQLArbitraryResult } from '../../../types';
import { getFieldDefinitionNodeArbitrary } from './field-definition-node';

export async function getCreateMutationArbitrary(
    documentNode: Readonly<DocumentNode>,
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>,
    includedFieldTypes: 'SCALAR' | 'RELATION' | 'SCALAR_AND_RELATION'
) {
    // TODO try to figure this out better...I do not think this will shrink appropriately
    // TODO because we are not really deriving our values from it
    // TODO we just have to extend the fc.Arbitrary in a custom class, that should give us exactly what we want if the below is not good enough
    return fc.boolean().map((arbBool: boolean) => {
        return async () => {
            // TODO remove this restriction later
            // TODO just working on scalars for now
            const fieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = objectTypeDefinitionNode.fields?.filter((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
                return (
                    fieldDefinitionNode.name.value !== 'id' &&
                    // isFieldDefinitionNodeARelation(documentNode, fieldDefinitionNode) === false && // TODO pass in a variable to toggle scalars? Figure out if we want just random input values created
                    (
                        getDirectiveArgumentValue(fieldDefinitionNode, 'db', 'ignore') === undefined ||
                        getDirectiveArgumentValue(fieldDefinitionNode, 'db', 'ignore') === false
                    ) &&
                    (
                        isFieldDefinitionNodeARelation(
                            documentNode,
                            fieldDefinitionNode
                        ) === (includedFieldTypes === 'SCALAR' ? false : true) ||
                        (
                            isFieldDefinitionNodeASingleRelation(
                                documentNode,
                                fieldDefinitionNode
                            ) === true &&
                            fieldDefinitionNode.type.kind === 'NonNullType'
                        )
                    )
                );
            }) || [];

            console.log('field definition node names');
            console.log(fieldDefinitionNodes.map((x) => x.name.value));

            const queryName: string = `create${objectTypeDefinitionNode.name.value}`;

            // TODO we probably do not need anything to be async here once we have the create input arbitrary
            const inputs: ReadonlyArray<GraphQLArbitraryInput> = await fieldDefinitionNodes.reduce(async (result: Promise<{}>, fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
                const key: string = fieldDefinitionNode.name.value;
                const value: any = fc.sample(await getFieldDefinitionNodeArbitrary(documentNode, objectTypeDefinitionNode, fieldDefinitionNode), 1)[0];

                return {
                    ...(await result),
                    [key]: {
                        type: isFieldDefinitionNodeARelation(documentNode, fieldDefinitionNode) === true ? 'Object' : getTypeNameFromTypeNode(fieldDefinitionNode.type),
                        value: typeof value === 'function' ? value() : value
                    }
                };
            }, Promise.resolve({}));

            return {
                query: `
                    mutation {
                        ${queryName}(input: {
                            ${Object.entries(inputs).map((inputEntry) => {
                                const inputKey: string = inputEntry[0];
                                const inputValue = inputEntry[1];
    
                                return `${inputKey}: ${getInputValueString(inputValue)}`;
                            }).join('\n')}
                        }) {
                            id
                            ${Object.entries(inputs).map((inputEntry) => {
                                const inputKey: string = inputEntry[0];
                                const inputValue = inputEntry[1];

                                if (inputValue.type === 'Object') {
                                    return `${inputKey} {
                                        id
                                    }`;
                                }
                                else {
                                    return inputKey;
                                }
                            }).join('\n')}
                        }
                    }
                `,
                queryName,
                inputs
            };
        };
    });
}

function getInputValueString(inputValue: any): string {
    if (inputValue.type === 'String') {
        return `"${inputValue.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }

    if (inputValue.type === 'DateTime') {
        return `"${new Date(inputValue.value).toISOString()}"`;
    }

    return inputValue.value.toString();
}