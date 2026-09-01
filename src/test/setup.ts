/* Глобальный setup Vitest: jest-dom матчеры + очистка DOM между тестами. */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

/* Каждый тест стартует с чистого DOM — иначе render() накапливает деревья
 * и запросы screen.* ловят элементы от предыдущих тестов (ambiguous). */
afterEach(() => {
  cleanup();
});
