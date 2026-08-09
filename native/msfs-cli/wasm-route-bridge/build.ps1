param(
    [string]$SdkRoot = $env:MSFS2024_SDK,
    [string]$OutputDirectory = "$PSScriptRoot\build",
    [string]$PackageName = 'msfs-native-cli-route-bridge',
    [string]$PackageToolStagingDirectory = (Join-Path ([IO.Path]::GetTempPath()) 'msfs-native-cli-route-bridge-package-tool'),
    [ValidateSet('Full', 'Smoke')]
    [string]$DiagnosticMode = 'Full'
)

if ([string]::IsNullOrWhiteSpace($SdkRoot) -or -not (Test-Path $SdkRoot)) { throw 'Set MSFS2024_SDK to the MSFS 2024 SDK root.' }
$SdkRoot = (Resolve-Path $SdkRoot).Path
if (-not $SdkRoot.EndsWith([IO.Path]::DirectorySeparatorChar)) { $SdkRoot += [IO.Path]::DirectorySeparatorChar }
$packageTool = Join-Path $SdkRoot 'Tools\bin\fspackagetool.exe'
$packageToolProjectSource = Join-Path $PSScriptRoot 'package-tool\msfs-native-cli-route-bridge-project.xml'
$packageToolDefinitionsSource = Join-Path $PSScriptRoot 'package-tool\PackageDefinitions'
$officialProject = Join-Path $PSScriptRoot 'msfs-route-bridge.vcxproj'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) { throw 'Visual Studio Installer (vswhere.exe) was not found.' }
$vs2022Root = @(& $vswhere -products Microsoft.VisualStudio.Product.Community -version '[17.0,18.0)' -property installationPath | Select-Object -First 1)
if ($vs2022Root.Count -ne 1 -or [string]::IsNullOrWhiteSpace($vs2022Root[0])) { throw 'Visual Studio 2022 Community is required for the MSFS2024 platform toolset.' }
$msbuild = Join-Path $vs2022Root[0] 'MSBuild\Current\Bin\MSBuild.exe'
$officialWasm = Join-Path $PSScriptRoot 'build-msfs\Release\msfs-route-bridge.wasm'
$requiredPaths = @($packageTool, $packageToolProjectSource, $packageToolDefinitionsSource, $officialProject, $msbuild)
foreach ($requiredPath in $requiredPaths) {
    if (-not (Test-Path $requiredPath)) { throw "Required MSFS 2024 WASM SDK path was not found: $requiredPath" }
}

function Read-WasmUnsignedLeb128 {
    param([byte[]]$Bytes, [ref]$Offset)
    [uint32]$value = 0
    $shift = 0
    do {
        if ($Offset.Value -ge $Bytes.Length) { throw 'Unexpected end of WASM while reading LEB128.' }
        $current = $Bytes[$Offset.Value]
        $Offset.Value++
        $value = $value -bor (($current -band 0x7f) -shl $shift)
        $shift += 7
    } while (($current -band 0x80) -ne 0)
    return $value
}

function Read-WasmString {
    param([byte[]]$Bytes, [ref]$Offset)
    $length = Read-WasmUnsignedLeb128 -Bytes $Bytes -Offset $Offset
    if ($Offset.Value + $length -gt $Bytes.Length) { throw 'Unexpected end of WASM while reading a string.' }
    $value = [Text.Encoding]::UTF8.GetString($Bytes, $Offset.Value, $length)
    $Offset.Value += $length
    return $value
}

function Skip-WasmLimits {
    param([byte[]]$Bytes, [ref]$Offset)
    $flags = Read-WasmUnsignedLeb128 -Bytes $Bytes -Offset $Offset
    $null = Read-WasmUnsignedLeb128 -Bytes $Bytes -Offset $Offset
    if (($flags -band 1) -ne 0) { $null = Read-WasmUnsignedLeb128 -Bytes $Bytes -Offset $Offset }
}

function Get-WasmImports {
    param([string]$Path)
    [byte[]]$bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 8 -or $bytes[0] -ne 0 -or $bytes[1] -ne 0x61 -or $bytes[2] -ne 0x73 -or $bytes[3] -ne 0x6d) {
        throw "Not a valid WebAssembly module: $Path"
    }
    $offset = [ref]8
    $imports = @()
    while ($offset.Value -lt $bytes.Length) {
        $sectionId = $bytes[$offset.Value]
        $offset.Value++
        $sectionSize = Read-WasmUnsignedLeb128 -Bytes $bytes -Offset $offset
        $sectionEnd = $offset.Value + $sectionSize
        if ($sectionEnd -gt $bytes.Length) { throw 'Invalid WASM section size.' }
        if ($sectionId -eq 2) {
            $count = Read-WasmUnsignedLeb128 -Bytes $bytes -Offset $offset
            for ($index = 0; $index -lt $count; $index++) {
                $module = Read-WasmString -Bytes $bytes -Offset $offset
                $name = Read-WasmString -Bytes $bytes -Offset $offset
                $kind = $bytes[$offset.Value]
                $offset.Value++
                switch ($kind) {
                    0 { $null = Read-WasmUnsignedLeb128 -Bytes $bytes -Offset $offset }
                    1 { $offset.Value++; Skip-WasmLimits -Bytes $bytes -Offset $offset }
                    2 { Skip-WasmLimits -Bytes $bytes -Offset $offset }
                    3 { $offset.Value += 2 }
                    4 {
                        $null = Read-WasmUnsignedLeb128 -Bytes $bytes -Offset $offset
                        $null = Read-WasmUnsignedLeb128 -Bytes $bytes -Offset $offset
                    }
                    default { throw "Unsupported WASM import kind: $kind" }
                }
                $imports += "$module`:$name"
            }
        }
        $offset.Value = $sectionEnd
    }
    return $imports
}

function Get-WasmExports {
    param([string]$Path)
    [byte[]]$bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 8 -or $bytes[0] -ne 0 -or $bytes[1] -ne 0x61 -or $bytes[2] -ne 0x73 -or $bytes[3] -ne 0x6d) {
        throw "Not a valid WebAssembly module: $Path"
    }
    $offset = [ref]8
    $exports = @()
    while ($offset.Value -lt $bytes.Length) {
        $sectionId = $bytes[$offset.Value]
        $offset.Value++
        $sectionSize = Read-WasmUnsignedLeb128 -Bytes $bytes -Offset $offset
        $sectionEnd = $offset.Value + $sectionSize
        if ($sectionEnd -gt $bytes.Length) { throw 'Invalid WASM section size.' }
        if ($sectionId -eq 7) {
            $count = Read-WasmUnsignedLeb128 -Bytes $bytes -Offset $offset
            for ($index = 0; $index -lt $count; $index++) {
                $name = Read-WasmString -Bytes $bytes -Offset $offset
                $kind = $bytes[$offset.Value]
                $offset.Value++
                $null = Read-WasmUnsignedLeb128 -Bytes $bytes -Offset $offset
                $exports += [ordered]@{ Name = $name; Kind = $kind }
            }
        }
        $offset.Value = $sectionEnd
    }
    return $exports
}

if ($DiagnosticMode -ne 'Full') { throw 'Diagnostic smoke builds used the retired manual linker and are no longer supported.' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$wasm = Join-Path $OutputDirectory 'msfs-route-bridge.wasm'
$previousSdkRoot = $env:MSFS2024_SDK
$env:MSFS2024_SDK = $SdkRoot
& $msbuild $officialProject '/t:Rebuild' '/p:Configuration=Release;Platform=MSFS' '/m'
$msbuildExitCode = $LASTEXITCODE
$env:MSFS2024_SDK = $previousSdkRoot
if ($msbuildExitCode -ne 0) { exit $msbuildExitCode }
if (-not (Test-Path $officialWasm)) { throw "Official MSFS toolset did not produce the expected WASM: $officialWasm" }
Copy-Item -Force -Path $officialWasm -Destination $wasm

$allowedEnvImports = @(
    'env:fsCommBusRegister',
    'env:fsCommBusCall',
    'env:fsCommBusUnregisterOneEvent',
    'env:fsPlannedRouteGetEfbRoute',
    # The official MSFS2024 platform toolset emits this runtime import.
    'wasi_snapshot_preview1:commit_pages'
)
$unexpectedImports = Get-WasmImports -Path $wasm | Where-Object {
    $_ -notin $allowedEnvImports
}
if ($unexpectedImports) {
    throw "WASM contains unexpected unresolved imports: $($unexpectedImports -join ', ')"
}

# MSFS 2024 detects the target SDK generation through the entry points supplied
# by MSFS_WasmVersions.a. wasm-ld garbage-collects them unless they are explicit
# exports, silently turning the result into a legacy MSFS 2020 module. Read the
# export section rather than scanning bytes, as a symbol name may exist without
# being exported.
$requiredVersionExports = @('GetSimConnectVersion', 'GetExtensionVersionBuffer', 'GetExtensionVersion')
$wasmFunctionExports = Get-WasmExports -Path $wasm | Where-Object { $_.Kind -eq 0 } | ForEach-Object { $_.Name }
$missingVersionExports = $requiredVersionExports | Where-Object { $_ -notin $wasmFunctionExports }
if ($missingVersionExports) {
    throw "WASM is missing required MSFS 2024 version exports: $($missingVersionExports -join ', ')"
}

# Package Tool owns manifest.json and layout.json. Hand-writing either file can
# leave the package in a legacy/unmounted state even though the WASM itself is
# valid. Its launcher is not Unicode-safe, so stage the Package Tool project
# and all of its output under an ASCII-only temporary path before copying the
# finished package back to the requested build directory.
$stagedProjectDirectory = Join-Path $PackageToolStagingDirectory 'project'
$stagedDefinitionsDirectory = Join-Path $stagedProjectDirectory 'PackageDefinitions'
$stagedSourceModulesDirectory = Join-Path $stagedProjectDirectory 'PackageSources\modules'
$stagedProject = Join-Path $stagedProjectDirectory 'msfs-native-cli-route-bridge-project.xml'
$stagedPackageOutputDirectory = Join-Path $PackageToolStagingDirectory 'package-output'
$stagedPackageTemporaryDirectory = Join-Path $PackageToolStagingDirectory 'package-temp'
New-Item -ItemType Directory -Force -Path $stagedDefinitionsDirectory, $stagedSourceModulesDirectory, $stagedPackageOutputDirectory, $stagedPackageTemporaryDirectory | Out-Null
Copy-Item -Force -Path $packageToolProjectSource -Destination $stagedProject
Copy-Item -Force -Path (Join-Path $packageToolDefinitionsSource '*') -Destination $stagedDefinitionsDirectory
Copy-Item -Force -Path $wasm -Destination (Join-Path $stagedSourceModulesDirectory 'msfs-route-bridge.wasm')

& $packageTool $stagedProject '-outputdir' $stagedPackageOutputDirectory '-tempdir' $stagedPackageTemporaryDirectory '-rebuild' '-mirroring' '-forcesteam' '-nopause'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$stagedPackageRoots = @(Get-ChildItem -LiteralPath $stagedPackageOutputDirectory -Directory -Recurse | Where-Object {
    $_.Name -eq $PackageName -and
    (Test-Path (Join-Path $_.FullName 'manifest.json')) -and
    (Test-Path (Join-Path $_.FullName 'layout.json'))
})
if ($stagedPackageRoots.Count -ne 1) {
    throw "Package Tool should produce exactly one '$PackageName' directory under $stagedPackageOutputDirectory; found $($stagedPackageRoots.Count)."
}
$stagedPackageRoot = $stagedPackageRoots[0].FullName
$packageOutputDirectory = Join-Path $OutputDirectory 'package-tool'
$packageRoot = Join-Path $packageOutputDirectory $PackageName
$stagedPackagedWasm = Join-Path $stagedPackageRoot 'modules\msfs-route-bridge.wasm'
$stagedPackageManifest = Join-Path $stagedPackageRoot 'manifest.json'
$stagedPackageLayout = Join-Path $stagedPackageRoot 'layout.json'
foreach ($packageFile in @($stagedPackagedWasm, $stagedPackageManifest, $stagedPackageLayout)) {
    if (-not (Test-Path $packageFile)) { throw "Package Tool did not produce the expected package file: $packageFile" }
}
New-Item -ItemType Directory -Force -Path $packageOutputDirectory | Out-Null
Copy-Item -Force -Recurse -Path $stagedPackageRoot -Destination $packageOutputDirectory

Write-Host "WASM: $wasm"
Write-Host "Community Package: $packageRoot"
Write-Host "Diagnostic mode: $DiagnosticMode"
