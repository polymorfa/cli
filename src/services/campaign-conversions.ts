import type {
  CampaignConversion,
  CampaignConversionReport,
  ClientInstance,
  RecordCampaignConversionRequest,
  ResponseMetadata,
} from '@polymorfa/sdk'

import type {CampaignResult} from './campaigns.js'

/** Report a conversion for one campaign recipient (beta). */
export async function recordCampaignConversion(
  client: ClientInstance<'organization'>,
  campaignId: string,
  body: RecordCampaignConversionRequest,
): Promise<CampaignResult<CampaignConversion>> {
  const response = await client.campaigns.recordConversion(campaignId, body)
  return result(response.data.data, response.metadata)
}

/** A campaign's conversion counts and per-currency values (beta). */
export async function viewCampaignConversions(
  client: ClientInstance<'organization'>,
  campaignId: string,
  projectId: string,
): Promise<CampaignResult<CampaignConversionReport>> {
  const response = await client.campaigns.conversions(campaignId, {projectId})
  return result(response.data.data, response.metadata)
}

/**
 * The caller's event ID is not echoed: it can be an order number and the
 * API stores only its hash.
 */
export function renderCampaignConversion(
  conversion: CampaignConversion,
): string {
  return [
    `${conversion.replayed ? 'Already recorded' : 'Recorded'} conversion ${conversion.id}`,
    `Campaign\t${conversion.campaignId}`,
    `Outcome\t${conversion.attribution.outcome}`,
    `Window\t${conversion.attribution.windowDays} days after the recipient was sent`,
    ...(conversion.value === null
      ? []
      : [
          `Value\t${conversion.value.amountMinor} ${conversion.value.currency} (minor units, as reported)`,
        ]),
  ].join('\n')
}

export function renderCampaignConversions(
  report: CampaignConversionReport,
): string {
  return [
    `Campaign\t${report.campaignId}`,
    `Window\t${report.model.windowDays} days after the recipient was sent`,
    `Attributed\t${report.conversions.attributed}`,
    `Outside window\t${report.conversions.outsideWindow}`,
    `Not sent\t${report.conversions.notSent}`,
    `Opted out\t${report.conversions.optedOut}`,
    `Converted recipients\t${report.convertedRecipients} of ${report.sentCount} sent`,
    `Conversion rate\t${report.conversionRate}`,
    ...report.values.map(
      (value) =>
        `Value ${value.currency}\t${value.attributedAmountMinor} attributed, ${value.unattributedAmountMinor} not attributed (minor units, as reported)`,
    ),
  ].join('\n')
}

function result<T>(data: T, metadata: ResponseMetadata): CampaignResult<T> {
  return {
    data,
    metadata: {
      attempts: metadata.attempts,
      status: metadata.status,
      ...(metadata.apiVersion === undefined
        ? {}
        : {apiVersion: metadata.apiVersion}),
      ...(metadata.requestId === undefined
        ? {}
        : {requestId: metadata.requestId}),
    },
  }
}
