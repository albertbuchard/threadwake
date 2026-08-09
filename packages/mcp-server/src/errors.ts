import {
  CONTRACT_VERSION,
  WorkGraphErrorSchema,
  type WorkGraphErrorData,
} from "@threadwake/contracts";

export type WorkGraphErrorCode = WorkGraphErrorData["error"]["code"];

export class WorkGraphError extends Error {
  readonly code: WorkGraphErrorCode;
  readonly details: Record<string, unknown> | undefined;
  readonly retryable: boolean;

  constructor(
    code: WorkGraphErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "WorkGraphError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }

  toData(): WorkGraphErrorData {
    return WorkGraphErrorSchema.parse({
      contractVersion: CONTRACT_VERSION,
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    });
  }
}

export const normalizeWorkGraphError = (error: unknown): WorkGraphError => {
  if (error instanceof WorkGraphError) {
    return error;
  }

  return new WorkGraphError(
    "INTERNAL",
    "The server could not complete the operation because of an unexpected internal error.",
  );
};
