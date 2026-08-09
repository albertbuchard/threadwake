import type {
  CapabilitiesResult,
  ChangePreviewResult,
  ChangeReceipt,
  ConfirmFixtureChangeInput,
  GetEvidenceInput,
  GetEvidenceResult,
  GetWorkUnitResult,
  HealthResult,
  LifecycleChangeRequest,
  ListWorkUnitsInput,
  ListWorkUnitsResult,
  SearchWorkUnitsInput,
  UndoFixtureChangeInput,
  UndoReceipt,
} from "@threadwake/contracts";

export interface WorkGraphRepository {
  capabilities(): CapabilitiesResult;
  health(): HealthResult;
  listWorkUnits(input: ListWorkUnitsInput): ListWorkUnitsResult;
  getWorkUnit(id: string): GetWorkUnitResult;
  searchWorkUnits(input: SearchWorkUnitsInput): ListWorkUnitsResult;
  getEvidence(input: GetEvidenceInput): GetEvidenceResult;
  previewFixtureChange(input: LifecycleChangeRequest): ChangePreviewResult;
  confirmFixtureChange(input: ConfirmFixtureChangeInput): ChangeReceipt;
  undoFixtureChange(input: UndoFixtureChangeInput): UndoReceipt;
}
