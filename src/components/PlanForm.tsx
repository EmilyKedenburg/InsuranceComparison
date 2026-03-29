import { useId, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { AccountContributionType, CoverageType, InsurancePlan } from '../types/insurance'

interface PlanFormProps {
  title: string
  plan: InsurancePlan
  isCheaper: boolean
  coverageType: CoverageType
  compact?: boolean
  fieldErrors?: Partial<Record<keyof InsurancePlan, string>>
  warnings?: string[]
  onRemove?: () => void
  onChange: (field: keyof InsurancePlan, value: string | number) => void
}

const numericFields: Array<{
  key: Exclude<keyof InsurancePlan, 'name'>
  label: string
  step?: string
}> = [
  { key: 'monthlyPremium', label: 'Monthly Premium' },
  { key: 'coinsurance', label: 'Coinsurance (%)', step: '1' },
  { key: 'employerContribution', label: 'Employer Contribution' },
]

const coverageFieldGroups: Array<{
  title: string
  coverageType: CoverageType
  fields: Array<{
    key:
      | 'individualDeductible'
      | 'familyDeductible'
      | 'individualOutOfPocketMax'
      | 'familyOutOfPocketMax'
    label: string
  }>
}> = [
  {
    title: 'Individual Coverage',
    coverageType: 'individual',
    fields: [
      { key: 'individualDeductible', label: 'Individual Deductible' },
      { key: 'individualOutOfPocketMax', label: 'Individual OOP Max' },
    ],
  },
  {
    title: 'Family Coverage',
    coverageType: 'family',
    fields: [
      { key: 'familyDeductible', label: 'Family Deductible' },
      { key: 'familyOutOfPocketMax', label: 'Family OOP Max' },
    ],
  },
]

export function PlanForm({
  title,
  plan,
  isCheaper,
  coverageType,
  compact = false,
  fieldErrors = {},
  warnings = [],
  onRemove,
  onChange,
}: PlanFormProps) {
  const [showContributionTooltip, setShowContributionTooltip] = useState(false)
  const tooltipId = useId()

  const handleTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.name as keyof InsurancePlan, event.target.value)
  }

  const handleNumberChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    onChange(name as keyof InsurancePlan, value === '' ? 0 : Number(value))
  }

  const contributionLabel =
    plan.accountContributionType === 'hra' ? 'HRA Contribution' : 'HSA Contribution'
  const contributionTooltip =
    plan.accountContributionType === 'hra'
      ? 'HRA: employer-funded reimbursement money that is controlled by the employer.'
      : 'HSA: money deposited into a health savings account that the employee owns.'

  return (
    <section
      className={`rounded-3xl border p-6 shadow-sm transition ${
        isCheaper
          ? 'border-emerald-400 bg-emerald-50/80'
          : 'border-slate-200 bg-white/80'
      }`}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            {title}
          </p>
          <h2 className="text-xl font-semibold text-slate-900">{plan.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          {isCheaper ? (
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
              Lower Total Cost
            </span>
          ) : null}
          {onRemove ? (
            <button
              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
              type="button"
              onClick={onRemove}
            >
              Remove Plan
            </button>
          ) : null}
        </div>
      </div>

      <div className={`grid gap-4 ${compact ? '' : 'sm:grid-cols-2'}`}>
        <label className="sm:col-span-2">
          <span className="mb-2 block text-sm font-medium text-slate-700">
            Plan Name
          </span>
          <input
            aria-invalid={Boolean(fieldErrors.name)}
            className={`w-full rounded-2xl border bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 ${
              fieldErrors.name ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
            }`}
            name="name"
            type="text"
            value={plan.name}
            onChange={handleTextChange}
          />
          {fieldErrors.name ? (
            <p className="mt-2 text-sm text-rose-600">{fieldErrors.name}</p>
          ) : null}
        </label>

        {numericFields.map((field) => (
          <label key={field.key}>
            <span className="mb-2 block text-sm font-medium text-slate-700">
              {field.label}
            </span>
            <input
              aria-invalid={Boolean(fieldErrors[field.key])}
              className={`w-full rounded-2xl border bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 ${
                fieldErrors[field.key]
                  ? 'border-rose-400 bg-rose-50'
                  : 'border-slate-200'
              }`}
              min="0"
              name={field.key}
              step={field.step ?? '0.01'}
              type="number"
              value={plan[field.key]}
              onChange={handleNumberChange}
            />
            {fieldErrors[field.key] ? (
              <p className="mt-2 text-sm text-rose-600">{fieldErrors[field.key]}</p>
            ) : null}
          </label>
        ))}

        <div>
          <div className="relative mb-2 h-5">
            <div className="flex items-center gap-2 pr-24">
              <span className="text-sm font-medium leading-5 text-slate-700">
                {contributionLabel}
              </span>
              <div className="relative">
                <button
                  aria-describedby={showContributionTooltip ? tooltipId : undefined}
                  aria-expanded={showContributionTooltip}
                  aria-label={`${contributionLabel} help`}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-[11px] font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 focus:border-sky-400 focus:bg-sky-100 focus:outline-none"
                  type="button"
                  onBlur={() => setShowContributionTooltip(false)}
                  onFocus={() => setShowContributionTooltip(true)}
                  onMouseEnter={() => setShowContributionTooltip(true)}
                  onMouseLeave={() => setShowContributionTooltip(false)}
                >
                  i
                </button>
                <div
                  aria-hidden={!showContributionTooltip}
                  aria-live="polite"
                  className={`absolute bottom-full left-1/2 z-10 mb-3 w-64 -translate-x-1/2 rounded-2xl border border-sky-100 bg-sky-50/95 px-3 py-2 text-xs leading-5 text-slate-700 shadow-lg shadow-slate-200/50 backdrop-blur transition-opacity duration-150 ease-out ${
                    showContributionTooltip
                      ? 'pointer-events-auto opacity-100'
                      : 'pointer-events-none opacity-0'
                  }`}
                  id={tooltipId}
                  role={showContributionTooltip ? 'tooltip' : undefined}
                >
                  {contributionTooltip}
                  <span className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-sky-100 bg-sky-50/95" />
                </div>
              </div>
            </div>
            <div
              aria-label="Account contribution type"
              className="absolute right-0 top-1/2 inline-flex -translate-y-1/2 rounded-full border border-slate-200 bg-slate-100 p-0.5 shadow-sm"
              role="group"
            >
              {(['hsa', 'hra'] as AccountContributionType[]).map((type) => {
                const isSelected = plan.accountContributionType === type

                return (
                  <button
                    key={type}
                    aria-pressed={isSelected}
                    className={`rounded-full px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
                      isSelected
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                    type="button"
                    onClick={() => onChange('accountContributionType', type)}
                  >
                    {type}
                  </button>
                )
              })}
            </div>
          </div>

          <input
            aria-label={contributionLabel}
            aria-invalid={Boolean(fieldErrors.hsaHraContribution)}
            className={`w-full rounded-2xl border bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 ${
              fieldErrors.hsaHraContribution
                ? 'border-rose-400 bg-rose-50'
                : 'border-slate-200'
            }`}
            min="0"
            name="hsaHraContribution"
            step="0.01"
            type="number"
            value={plan.hsaHraContribution}
            onChange={handleNumberChange}
          />
          {fieldErrors.hsaHraContribution ? (
            <p className="mt-2 text-sm text-rose-600">{fieldErrors.hsaHraContribution}</p>
          ) : null}
        </div>

        {coverageFieldGroups.map((group) => {
          const isActive = coverageType === group.coverageType

          return (
            <div
              key={group.title}
              className={`rounded-2xl border p-4 ${compact ? '' : 'sm:col-span-2'} ${
                isActive
                  ? 'border-sky-200 bg-sky-50/70'
                  : 'border-slate-200 bg-slate-50 text-slate-400'
              }`}
            >
              <p
                className={`mb-3 text-sm font-semibold uppercase tracking-[0.16em] ${
                  isActive ? 'text-sky-700' : 'text-slate-400'
                }`}
              >
                {group.title}
              </p>
              <div className={`grid gap-4 ${compact ? '' : 'sm:grid-cols-2'}`}>
                {group.fields.map((field) => (
                  <label key={field.key}>
                    <span
                      className={`mb-2 block text-sm font-medium ${
                        isActive ? 'text-slate-700' : 'text-slate-400'
                      }`}
                    >
                      {field.label}
                    </span>
                    <input
                      aria-invalid={isActive && Boolean(fieldErrors[field.key])}
                      className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${
                        !isActive
                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                          : fieldErrors[field.key]
                            ? 'border-rose-400 bg-rose-50 text-slate-900 focus:border-sky-500'
                            : 'border-slate-200 bg-white text-slate-900 focus:border-sky-500'
                      }`}
                      disabled={!isActive}
                      min="0"
                      name={field.key}
                      step="0.01"
                      type="number"
                      value={plan[field.key]}
                      onChange={handleNumberChange}
                    />
                    {isActive && fieldErrors[field.key] ? (
                      <p className="mt-2 text-sm text-rose-600">{fieldErrors[field.key]}</p>
                    ) : null}
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {warnings.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </section>
  )
}
