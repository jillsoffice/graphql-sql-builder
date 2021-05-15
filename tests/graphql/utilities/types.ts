
import { JOTableName } from '../../../types.d';

export type QueryType = 
    | 'CREATE'
    | 'UPDATE'
    | 'FIND'
    | 'GET' 
    | 'DELETE';

export type ScalarMutationFieldValues = {
    readonly isNonNullType: boolean;
    readonly fieldName: string;
    readonly fieldType: string;
    readonly relationshipType: 'SCALAR';
    readonly scalarFieldVariableName: string;
    readonly scalarFieldValue: any;
}

export type RelationshipMutationFieldValues = {
    readonly isNonNullType: boolean;
    readonly fieldName: string;
    readonly fieldType: string;
    readonly relationshipType: 'SINGLE_RELATION' | 'MULTIPLE_RELATION';
    readonly relationshipTable: Readonly<JOTableName>;
    readonly singleRelationConnectId: number | 'NOT_SINGLE_RELATION';
    readonly multipleRelationConnectIds: ReadonlyArray<number> | 'NOT_MULTIPLE_RELATION';
}

export type MutationFieldValues = ScalarMutationFieldValues | RelationshipMutationFieldValues;

export type RelationshipCreateResult = {
    readonly fieldName: string;
    readonly tableName: Readonly<JOTableName>;
    readonly relationshipType: 'SINGLE_RELATION';
    readonly createResult: Readonly<any>; // graphback create result
    readonly relationshipCreateResults?: ReadonlyArray<RelationshipCreateResult>;
} |
{
    readonly fieldName: string;
    readonly tableName: Readonly<JOTableName>;
    readonly relationshipType: 'MULTIPLE_RELATION';
    readonly createResults: ReadonlyArray<any>; // array of graphback create results
    readonly relationshipCreateResults?: ReadonlyArray<RelationshipCreateResult>;
}

export type MutationVariablesObject = {
    [key: string]: any;
}

export type FilterType = 
    | 'ne'
    | 'eq'
    | 'le'
    | 'lt'
    | 'ge'
    | 'gt'
    | 'in';