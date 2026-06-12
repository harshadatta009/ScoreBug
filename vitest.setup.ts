/**
 * Vitest global setup.
 *
 * Importing @testing-library/jest-dom extends Vitest's expect matchers with
 * DOM-specific assertions (toBeInTheDocument, toHaveClass, etc.) so RTL tests
 * read naturally without importing the extension in every file.
 */
import "@testing-library/jest-dom";
