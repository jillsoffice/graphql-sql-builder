// @ts-nocheck

import {
    QueryType,
    ScalarMutationFieldValues,
    RelationshipMutationFieldValues,
    MutationFieldValues,
    RelationshipCreateResult,
    MutationVariablesObject,
    FilterType
} from './types';


export async function runScalarMutation(
    mutationType: 'CREATE' | 'UPDATE',
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>,
    rowId: number | 'NOT_SET' = 'NOT_SET',
): Promise<any> {
    const mutationName: string = generateQueryName(mutationType, tableName);

    const objectTypeDefNode: Readonly<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodeForTableName(tableName, schemaAST);
    const objectTypeDefFields: ReadonlyArray<FieldDefinitionNode> | undefined = objectTypeDefNode.fields
    if (objectTypeDefFields === undefined) {
        throw new Error(`object type def fields are undefined for table '${tableName}'`);
    }

    const inputObjectTypeDefNode: Readonly<InputObjectTypeDefinitionNode> = getMutationInputObjectTypeDefinitionNode(mutationType, tableName, schemaAST);
    const inputFields: ReadonlyArray<InputValueDefinitionNode> | undefined = inputObjectTypeDefNode.fields;
    if (inputFields === undefined) {
        throw new Error(`input fields are undefined for mutationName ${mutationName}`);
    }
    const scalarScalarFieldValuesForGQLMutation: ReadonlyArray<ScalarFieldValuesForGQLMutation> = generateScalarFieldValuesForGQLMutation(inputFields, objectTypeDefFields, schemaAST);

    const gqlVarablesObject: any = generateScalarGQLVariablesObject(scalarScalarFieldValuesForGQLMutation);
    const mutationString: string = generateScalarMutationString(mutationName, scalarScalarFieldValuesForGQLMutation, rowId);
    // console.log('scalar mutation string:', mutationString);

    const graphql: any = await graphqlPromise;
    const gqlResult: any = await graphql.query(mutationString, gqlVarablesObject);

    verifyScalarMutationSucceeded(mutationName, gqlResult, scalarScalarFieldValuesForGQLMutation);

    return gqlResult.data[mutationName];
}