/**
 * Public surface of the geometry engine.
 *
 * Everything below is pure: no React, no DOM, no storage. That separation is
 * what allows the algorithms to be tested head-lessly and reused by the
 * export pipeline, the AI validator and the puzzle generator alike.
 */

export * from './types';
export * from './vec';
export * from './transforms';
export * from './polygons';
export * from './paper';
export * from './folds';
export * from './cuts';
export * from './unfold';
