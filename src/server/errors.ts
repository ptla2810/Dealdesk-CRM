/** Typed application errors. Messages are safe to show to end users. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly fieldErrors?: Record<string, string>,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Your session has expired. Please sign in again.") {
    super(message, "UNAUTHENTICATED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Record") {
    super(`${entity} not found or you do not have access to it.`, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(fieldErrors: Record<string, string>, message = "Please correct the highlighted fields.") {
    super(message, "VALIDATION", 422, fieldErrors);
  }
}

/** A business rule was violated (invalid stage transition, inactive product …). */
export class BusinessRuleError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message, "BUSINESS_RULE", 422, fieldErrors);
  }
}

/** Optimistic-concurrency or uniqueness conflict. */
export class ConflictError extends AppError {
  constructor(message = "This record was changed by someone else. Reload the page and try again.", fieldErrors?: Record<string, string>) {
    super(message, "CONFLICT", 409, fieldErrors);
  }
}

/** Possible duplicate found; the client may resubmit with acknowledgeDuplicates=true if permitted. */
export class DuplicateWarning extends AppError {
  constructor(
    readonly matches: { id: string; label: string; reason: string; href: string }[],
    readonly canOverride: boolean,
  ) {
    super(
      canOverride
        ? "Possible duplicate records found. Review them before continuing."
        : "Possible duplicate records found. Ask a manager to create this record or use the existing one.",
      "DUPLICATE_WARNING",
      409,
      undefined,
      { matches, canOverride },
    );
  }
}
