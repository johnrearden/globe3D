/**
 * Re-export shim. The implementation moved to @terragotcha/quiz-core, which is
 * shared with the React and React Native apps; this path is kept so the
 * existing vanilla imports (and tests/self-evident-capital.test.js) keep
 * working during the migration.
 */
export { capitalIsSelfEvident } from '@terragotcha/quiz-core/self-evident-capital.js';
