param(
    [Parameter(Mandatory = $true)]
    [string]$Cli,
    [Parameter(Mandatory = $true)]
    [string]$ReportPath
)

$ErrorActionPreference = 'Stop'

function Test-NonEmptyObject {
    param($Value)
    if ($null -eq $Value) {
        return $false
    }
    if ($Value -is [string]) {
        return -not [string]::IsNullOrWhiteSpace($Value)
    }
    if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [pscustomobject]) {
        foreach ($item in $Value) {
            if (Test-NonEmptyObject $item) {
                return $true
            }
        }
        return $false
    }
    foreach ($property in $Value.PSObject.Properties) {
        if (Test-NonEmptyObject $property.Value) {
            return $true
        }
    }
    return $false
}

function Invoke-CliJson {
    param([string[]]$Arguments)

    $output = @(& $Cli @Arguments)
    $exitCode = $LASTEXITCODE
    if ($output.Count -ne 1) {
        throw "CLI must write exactly one JSON document to stdout; got $($output.Count) lines."
    }
    try {
        $json = $output[0] | ConvertFrom-Json -ErrorAction Stop
    } catch {
        throw "CLI stdout is not valid JSON: $($output[0])"
    }
    return [pscustomobject]@{ Json = $json; ExitCode = $exitCode; Raw = $output[0] }
}

if ([string]::IsNullOrWhiteSpace($env:MSFS_GEO_CLOUD_BASE_URL) -or
    [string]::IsNullOrWhiteSpace($env:MSFS_GEO_API_KEY)) {
    Write-Host 'SKIP: MSFS_GEO_CLOUD_BASE_URL and MSFS_GEO_API_KEY are required for live Geo Cloud coverage checks.'
    exit 77
}

# These locations intentionally cover distinct geography that an aircraft can reach:
# dense city, open ocean, mountain range, coral reef, polar ice, desert, and a small island state.
$samples = @(
    @{ Id = 'shanghai_urban'; Name = 'Shanghai urban'; Lat = 31.2304; Lon = 121.4737; ExpectedFields = @('administrative.country', 'administrative.admin1', 'administrative.city') },
    @{ Id = 'pacific_ocean'; Name = 'Central Pacific Ocean'; Lat = 0.0; Lon = -140.0; ExpectedFields = @('natural') },
    @{ Id = 'himalaya_mountain'; Name = 'Himalaya mountain range'; Lat = 27.9881; Lon = 86.9250; ExpectedFields = @('natural') },
    @{ Id = 'great_barrier_reef'; Name = 'Great Barrier Reef'; Lat = -18.2871; Lon = 147.7000; ExpectedFields = @('natural') },
    @{ Id = 'antarctica_ice'; Name = 'Antarctic ice sheet'; Lat = -82.0; Lon = 0.0; ExpectedFields = @('natural') },
    @{ Id = 'sahara_desert'; Name = 'Sahara Desert'; Lat = 23.0; Lon = 13.0; ExpectedFields = @('administrative.country', 'administrative.admin1', 'natural') },
    @{ Id = 'tuvalu_island'; Name = 'Tuvalu small island'; Lat = -8.5206; Lon = 179.1982; ExpectedFields = @('administrative.country', 'administrative.admin1', 'natural') }
)

function Get-ObjectPathValue {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $value = $Object
    foreach ($segment in $Path.Split('.')) {
        if ($null -eq $value) {
            return $null
        }
        $property = $value.PSObject.Properties[$segment]
        if ($null -eq $property) {
            return $null
        }
        $value = $property.Value
    }
    return $value
}

$results = @()
foreach ($sample in $samples) {
    $call = Invoke-CliJson @(
        'external', 'geo', 'context',
        '--lat', $sample.Lat.ToString([Globalization.CultureInfo]::InvariantCulture),
        '--lon', $sample.Lon.ToString([Globalization.CultureInfo]::InvariantCulture),
        '--alt-m', '0', '--detail', 'full', '--locale', 'en-US', '--json'
    )

    $entry = [ordered]@{
        id = $sample.Id
        name = $sample.Name
        coordinate = [ordered]@{ lat = $sample.Lat; lon = $sample.Lon; coordinate_system = 'WGS84' }
        ok = [bool]$call.Json.ok
        expected_fields = $sample.ExpectedFields
        covered_fields = @()
        metadata_valid = $false
        error = $null
    }

    if (-not $call.Json.ok) {
        $entry.error = [ordered]@{ code = $call.Json.error.code; message = $call.Json.error.message }
        $results += [pscustomobject]$entry
        continue
    }

    if ($call.ExitCode -ne 0 -or $call.Json.data.origin -ne 'external_geo_cloud') {
        throw "Geo Cloud success response has an invalid CLI envelope for $($sample.Id)."
    }

    $context = $call.Json.data.context
    $meta = $context._meta
    $entry.metadata_valid = (Test-NonEmptyObject $meta) -and
        $meta.input_coordinate_system -eq 'WGS84' -and
        (Test-NonEmptyObject $meta.source_map)

    foreach ($field in $sample.ExpectedFields) {
        if (Test-NonEmptyObject (Get-ObjectPathValue $context $field)) {
            $entry.covered_fields += $field
        }
    }
    $results += [pscustomobject]$entry
}

$sampleCount = $results.Count
$transportSuccesses = @($results | Where-Object { $_.ok }).Count
$metadataSuccesses = @($results | Where-Object { $_.metadata_valid }).Count
$fieldSuccesses = @($results | Where-Object { $_.covered_fields.Count -eq $_.expected_fields.Count }).Count
$report = [ordered]@{
    schema_version = '1.0'
    generated_at_utc = [DateTime]::UtcNow.ToString('o')
    service = 'MSFS Geo Cloud /v1/location-context'
    sample_count = $sampleCount
    transport_success_rate = $transportSuccesses / $sampleCount
    metadata_valid_rate = $metadataSuccesses / $sampleCount
    expected_field_coverage_rate = $fieldSuccesses / $sampleCount
    samples = $results
}

$reportDirectory = Split-Path -Parent $ReportPath
if (-not [string]::IsNullOrWhiteSpace($reportDirectory)) {
    New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
}
$report | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -Path $ReportPath

if ($transportSuccesses -ne $sampleCount -or $metadataSuccesses -ne $sampleCount -or $fieldSuccesses -ne $sampleCount) {
    Write-Host "Geo Cloud coverage report: $ReportPath"
    throw "Geo Cloud coverage regression: transport=$transportSuccesses/$sampleCount metadata=$metadataSuccesses/$sampleCount fields=$fieldSuccesses/$sampleCount"
}

Write-Host "Geo Cloud coverage report: $ReportPath"
Write-Host "Geo Cloud coverage checks passed for $sampleCount global samples."
