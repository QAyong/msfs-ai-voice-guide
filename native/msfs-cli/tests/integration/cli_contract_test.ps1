param(
    [Parameter(Mandatory = $true)]
    [string]$Cli
)

$ErrorActionPreference = 'Stop'

function Assert-That {
    param(
        [Parameter(Mandatory = $true)]
        [bool]$Condition,
        [Parameter(Mandatory = $true)]
        [string]$Message
    )
    if (-not $Condition) {
        throw $Message
    }
}

function Invoke-CliJson {
    param([string[]]$Arguments)

    $output = @(& $Cli @Arguments)
    $exitCode = $LASTEXITCODE
    Assert-That ($output.Count -eq 1) "CLI must write exactly one JSON document to stdout; got $($output.Count) lines."

    try {
        $json = $output[0] | ConvertFrom-Json -ErrorAction Stop
    } catch {
        throw "CLI stdout is not valid JSON: $($output[0])"
    }
    return [pscustomobject]@{ Json = $json; ExitCode = $exitCode; Raw = $output[0] }
}

function Assert-ResponseEnvelope {
    param(
        [Parameter(Mandatory = $true)]$Result,
        [Parameter(Mandatory = $true)][bool]$ExpectedOk
    )

    $response = $Result.Json
    Assert-That ($null -ne $response.id -and $response.id.Length -gt 0) 'Response must have a non-empty correlation id.'
    Assert-That ($response.ok -is [bool]) 'Response ok must be a JSON boolean.'
    Assert-That ($response.ok -eq $ExpectedOk) "Unexpected ok value in: $($Result.Raw)"

    if ($ExpectedOk) {
        Assert-That ($Result.ExitCode -eq 0) 'Successful JSON response must have exit code 0.'
        Assert-That ($null -ne $response.data) 'Successful response must contain data.'
        Assert-That ($null -eq $response.error) 'Successful response must not contain error.'
    } else {
        Assert-That ($Result.ExitCode -ne 0) 'Failed JSON response must have a non-zero exit code.'
        Assert-That ($null -ne $response.error) 'Failed response must contain error.'
        Assert-That (-not [string]::IsNullOrWhiteSpace($response.error.code)) 'Error response must have error.code.'
        Assert-That (-not [string]::IsNullOrWhiteSpace($response.error.message)) 'Error response must have an actionable error.message.'
        Assert-That ($null -eq $response.data) 'Failed response must not contain ambiguous partial data.'
    }
}

# Agent discovery: a compact, typed status document states which capabilities are usable.
$status = Invoke-CliJson @('status', '--json')
Assert-ResponseEnvelope $status $true
Assert-That ($status.Json.data.daemon -eq 'ready') 'status.data.daemon must be ready.'
Assert-That ($status.Json.data.simconnect.transport -eq 'SimConnect') 'status must name the SimConnect transport.'
Assert-That ($status.Json.data.simconnect.connected -is [bool]) 'status.simconnect.connected must be boolean.'
Assert-That ($status.Json.data.route_bridge.transport -eq 'SimConnect CommBus') 'status must identify the route bridge transport.'

$monitorStatus = Invoke-CliJson @('status', '--role', 'monitor', '--json')
Assert-ResponseEnvelope $monitorStatus $true
Assert-That ($monitorStatus.Json.data.role -eq 'monitor') 'Explicit monitor status must use the monitor daemon.'

# Agent discovery: catalog results expose the exact SDK name, unit, mutability, and explanation.
$catalog = Invoke-CliJson @('catalog', 'simvar', 'search', '--query', 'altitude', '--json')
Assert-ResponseEnvelope $catalog $true
Assert-That ($catalog.Json.data.kind -eq 'simvar') 'Catalog kind must identify simvar results.'
Assert-That ($catalog.Json.data.results.Count -gt 0) 'Altitude catalog search must return at least one result.'
foreach ($item in $catalog.Json.data.results) {
    Assert-That (-not [string]::IsNullOrWhiteSpace($item.name)) 'Catalog item requires the SDK variable name.'
    Assert-That (-not [string]::IsNullOrWhiteSpace($item.units)) 'Catalog item requires units for an agent to interpret values.'
    Assert-That ($item.settable -is [bool]) 'Catalog item settable must be boolean.'
    Assert-That ($item.indexed -is [bool]) 'Catalog item indexed must be boolean.'
    Assert-That (-not [string]::IsNullOrWhiteSpace($item.description)) 'Catalog item requires a human/agent-readable description.'
}

# Reading works both in a loaded simulator and in an offline test environment: either branch is typed and actionable.
$simvar = Invoke-CliJson @('simvar', 'get', '--name', 'PLANE ALTITUDE', '--unit', 'feet', '--json')
if ($simvar.Json.ok) {
    Assert-ResponseEnvelope $simvar $true
    Assert-That ($simvar.Json.data.name -eq 'PLANE ALTITUDE') 'SimVar response must preserve the requested SDK name.'
    Assert-That ($simvar.Json.data.unit -eq 'feet') 'SimVar response must preserve the requested unit.'
    Assert-That ($simvar.Json.data.datatype -eq 'FLOAT64') 'SimVar response must state its data type.'
    Assert-That ($simvar.Json.data.value -is [double] -or
        $simvar.Json.data.value -is [decimal] -or
        $simvar.Json.data.value -is [int64] -or
        $simvar.Json.data.value -is [int32]) 'SimVar value must be numeric, not formatted display text.'
} else {
    Assert-ResponseEnvelope $simvar $false
    Assert-That ($simvar.Json.error.code -in @('SIM_NOT_READY', 'SDK_NOT_CONFIGURED', 'SIMCONNECT_TIMEOUT', 'SIMCONNECT_EXCEPTION')) "Offline SimVar error must be a known actionable code, got $($simvar.Json.error.code)."
}

# String SimVars use a null SimConnect UnitsName even though the CLI keeps --unit string for a stable command shape.
$stringSimvar = Invoke-CliJson @('simvar', 'get', '--name', 'TITLE', '--unit', 'string', '--datatype', 'string', '--json')
if ($stringSimvar.Json.ok) {
    Assert-ResponseEnvelope $stringSimvar $true
    Assert-That ($stringSimvar.Json.data.name -eq 'TITLE') 'String SimVar response must preserve the requested SDK name.'
    Assert-That ($stringSimvar.Json.data.datatype -eq 'STRING256') 'String SimVar response must identify its data type.'
    Assert-That ($stringSimvar.Json.data.value -is [string]) 'String SimVar value must be a JSON string.'
} else {
    Assert-ResponseEnvelope $stringSimvar $false
    Assert-That ($stringSimvar.Json.error.code -in @('SIM_NOT_READY', 'SDK_NOT_CONFIGURED', 'SIMCONNECT_EXCEPTION')) "Offline or unsupported string SimVar errors must be actionable, got $($stringSimvar.Json.error.code)."
}

# A state-changing operation is rejected before any simulator call unless the user explicitly opts in.
$unsafe = Invoke-CliJson @('key-event', 'send', '--name', 'GEAR_TOGGLE', '--json')
Assert-ResponseEnvelope $unsafe $false
Assert-That ($unsafe.Json.error.code -eq 'UNSAFE_REQUIRED') 'Mutating key event must require --unsafe.'

$unsafeSet = Invoke-CliJson @('simvar', 'set', '--name', 'AUTOPILOT ALTITUDE LOCK VAR', '--unit', 'feet', '--value', '5000', '--json')
Assert-ResponseEnvelope $unsafeSet $false
Assert-That ($unsafeSet.Json.error.code -eq 'UNSAFE_REQUIRED') 'Mutating SimVar writes must require --unsafe.'

# A loaded bridge may return a route; an absent bridge or absent EFB route remains a typed dependency/domain condition.
$route = Invoke-CliJson @('route', 'get', '--source', 'efb', '--json')
if ($route.Json.ok) {
    Assert-ResponseEnvelope $route $true
    Assert-That ($route.Json.data.source -eq 'efb') 'Successful EFB route responses must identify their source.'
    Assert-That ($null -ne $route.Json.data.route) 'Successful EFB route responses must contain route data.'
} else {
    Assert-ResponseEnvelope $route $false
    Assert-That ($route.Json.error.code -in @('SIM_NOT_READY', 'ROUTE_BRIDGE_UNAVAILABLE', 'ROUTE_TIMEOUT', 'ROUTE_NOT_FOUND')) 'Offline, missing bridge, or missing EFB route must have a dedicated actionable error code.'
}

# Direct Geo Cloud requests must keep configuration errors structured and never leak an API key.
$env:MSFS_GEO_CLOUD_BASE_URL = ''
$env:MSFS_GEO_API_KEY = 'contract-test-secret'
$geo = Invoke-CliJson @('external', 'geo', 'context', '--lat', '31.2304', '--lon', '121.4737', '--detail', 'coarse', '--json')
Assert-ResponseEnvelope $geo $false
Assert-That ($geo.Json.error.code -eq 'EXTERNAL_GEO_CONFIG_INVALID') 'Missing Geo Cloud base URL must be reported as a configuration error.'
Assert-That (-not $geo.Raw.Contains('contract-test-secret')) 'Geo API key must not be present in stdout.'

# Daemon shutdown is idempotent so applications and installers can clean up without starting it.
$daemonStop = Invoke-CliJson @('daemon', 'stop', '--json')
Assert-ResponseEnvelope $daemonStop $true
Assert-That (($daemonStop.Json.data.stopping -eq $true) -or ($daemonStop.Json.data.already_stopped -eq $true)) 'Daemon stop must report stopping or already stopped.'

$monitorStop = Invoke-CliJson @('daemon', 'stop', '--role', 'monitor', '--json')
Assert-ResponseEnvelope $monitorStop $true
Assert-That (($monitorStop.Json.data.stopping -eq $true) -or ($monitorStop.Json.data.already_stopped -eq $true)) 'Monitor daemon stop must be idempotent.'

Write-Host 'CLI contract checks passed.'
