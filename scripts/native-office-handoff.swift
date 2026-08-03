#!/usr/bin/env swift
// Bounded, non-interactive NSWorkspace handoff for the native Office bridge.
// CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.1

import AppKit
import Darwin
import Foundation

private let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    FileHandle.standardError.write(Data("usage error\n".utf8))
    exit(EX_USAGE)
}

let applicationURL = URL(fileURLWithPath: arguments[1]).standardizedFileURL
let artifactURL = URL(fileURLWithPath: arguments[2]).standardizedFileURL
let configuration = NSWorkspace.OpenConfiguration()
configuration.activates = false
configuration.addsToRecentItems = false
configuration.promptsUserIfNeeded = false

var completed = false
var resultCode: Int32 = EX_SOFTWARE

NSWorkspace.shared.open(
    [artifactURL],
    withApplicationAt: applicationURL,
    configuration: configuration
) { _, error in
    if let error = error as NSError? {
        let response = [
            "status": "failed",
            "errorDomain": error.domain,
            "errorCode": String(error.code),
        ]
        if let data = try? JSONSerialization.data(
            withJSONObject: response,
            options: [.sortedKeys]
        ) {
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data("\n".utf8))
        }
        resultCode = EX_UNAVAILABLE
    } else {
        FileHandle.standardOutput.write(
            Data("{\"status\":\"accepted\"}\n".utf8)
        )
        resultCode = EX_OK
    }
    completed = true
}

let deadline = Date(timeIntervalSinceNow: 15)
while !completed && Date() < deadline {
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
}

if !completed {
    FileHandle.standardOutput.write(
        Data("{\"status\":\"timed-out\"}\n".utf8)
    )
    exit(EX_TEMPFAIL)
}
exit(resultCode)
