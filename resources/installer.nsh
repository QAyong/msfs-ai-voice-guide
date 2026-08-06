; Stop the native MSFS daemon before replacing the installed runtime.
; The fallback is limited to the singleton msfsd process used by this project.
!macro customInit
  IfFileExists "$INSTDIR\resources\msfs\msfsd.exe" 0 msfs_daemon_stop_done
  IfFileExists "$INSTDIR\resources\msfs\msfs.exe" 0 msfs_daemon_legacy_fallback
    nsExec::Exec '"$INSTDIR\resources\msfs\msfs.exe" daemon stop --json'
    Pop $0
    ${If} $0 == 0
      Goto msfs_daemon_wait
    ${EndIf}
  msfs_daemon_legacy_fallback:
    nsExec::Exec '"$SYSDIR\cmd.exe" /c taskkill /f /im msfsd.exe'
    Pop $0
  msfs_daemon_wait:
    Sleep 300
  msfs_daemon_stop_done:
!macroend
