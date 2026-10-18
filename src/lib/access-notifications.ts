export type ApprovalRequest = { id: string; name: string; requested_at: string };
export type RequestCursor = { requestedAt: string; id: string };

export function isNewApprovalRequest(request: ApprovalRequest, cursor: RequestCursor) {
  return request.requested_at > cursor.requestedAt ||
    (request.requested_at === cursor.requestedAt && request.id > cursor.id);
}