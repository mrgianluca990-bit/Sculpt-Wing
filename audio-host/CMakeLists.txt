cmake_minimum_required(VERSION 3.22)
project(SculptWingAudio VERSION 0.7.2 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# An offline checkout may be supplied when developing. Release builds fetch the
# verified JUCE 9.0.5 commit, never a moving branch.
set(SCULPT_JUCE_SOURCE "" CACHE PATH "Existing JUCE 9.0.5 checkout")
if(SCULPT_JUCE_SOURCE)
    add_subdirectory("${SCULPT_JUCE_SOURCE}" "${CMAKE_BINARY_DIR}/JUCE")
    set(SCULPT_JUCE_ROOT "${SCULPT_JUCE_SOURCE}")
else()
    include(FetchContent)
    FetchContent_Declare(JUCE
        URL https://github.com/juce-framework/JUCE/archive/d60b7a78030661574a615b586d9325ba7a7fa7dd.tar.gz
        DOWNLOAD_EXTRACT_TIMESTAMP FALSE)
    FetchContent_MakeAvailable(JUCE)
    FetchContent_GetProperties(JUCE SOURCE_DIR SCULPT_JUCE_ROOT)
endif()

juce_add_gui_app(SculptWingAudio
    PRODUCT_NAME "SculptWingAudio"
    COMPANY_NAME "Sculpt"
    BUNDLE_ID "it.sculpt.wing.audio"
    MICROPHONE_PERMISSION_ENABLED TRUE
    MICROPHONE_PERMISSION_TEXT "Sculpt Wing riceve l'audio USB della WING per elaborarlo con i plugin VST3."
    NEEDS_WEB_BROWSER FALSE
    NEEDS_CURL FALSE
    PLIST_TO_MERGE "<plist><dict><key>LSUIElement</key><true/><key>NSHighResolutionCapable</key><true/></dict></plist>")

target_sources(SculptWingAudio PRIVATE Source/Main.cpp Source/Routing.h Source/SelfTest.h)
target_compile_definitions(SculptWingAudio PRIVATE
    JUCE_PLUGINHOST_VST3=1
    JUCE_PLUGINHOST_VST=0
    JUCE_PLUGINHOST_AU=0
    JUCE_PLUGINHOST_LADSPA=0
    JUCE_PLUGINHOST_LV2=0
    JUCE_PLUGINHOST_ARA=0
    JUCE_VST3_HOST_CROSS_PLATFORM_UID=1
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_USE_CAMERA=0
    JUCE_MODAL_LOOPS_PERMITTED=1)
target_link_libraries(SculptWingAudio PRIVATE
    juce::juce_audio_processors
    juce::juce_audio_devices
    juce::juce_recommended_config_flags)

# Preserve the upstream notices for the framework and vendored components in
# these modules. These files describe their own licences; they do not select or
# change the Sculpt Wing repository's licence.
set(SCULPT_NOTICE_DIR "${CMAKE_CURRENT_BINARY_DIR}/third-party-notices")
file(MAKE_DIRECTORY "${SCULPT_NOTICE_DIR}")
function(sculpt_notice relative_source output_name)
    set(output "${SCULPT_NOTICE_DIR}/${output_name}")
    configure_file("${SCULPT_JUCE_ROOT}/${relative_source}" "${output}" COPYONLY)
    target_sources(SculptWingAudio PRIVATE "${output}")
    set_source_files_properties("${output}" PROPERTIES
        MACOSX_PACKAGE_LOCATION "Resources/ThirdParty")
endfunction()
sculpt_notice("LICENSE.md" "JUCE-LICENSE.md")
sculpt_notice("JUCE.spdx.json" "JUCE.spdx.json")
sculpt_notice("modules/juce_audio_processors_headless/format_types/VST3_SDK/LICENSE.txt" "VST3-SDK-LICENSE.txt")
sculpt_notice("modules/juce_audio_processors_headless/format_types/VST3_SDK/base/LICENSE.txt" "VST3-Base-LICENSE.txt")
sculpt_notice("modules/juce_audio_processors_headless/format_types/VST3_SDK/pluginterfaces/LICENSE.txt" "VST3-Interfaces-LICENSE.txt")
sculpt_notice("modules/juce_audio_processors_headless/format_types/VST3_SDK/public.sdk/LICENSE.txt" "VST3-Public-SDK-LICENSE.txt")
sculpt_notice("modules/juce_core/zip/zlib/LICENSE" "zlib-LICENSE.txt")
sculpt_notice("modules/juce_graphics/fonts/harfbuzz/COPYING" "HarfBuzz-COPYING.txt")
sculpt_notice("modules/juce_graphics/unicode/sheenbidi/LICENSE" "SheenBidi-LICENSE.txt")
sculpt_notice("modules/juce_graphics/drawables/lunasvg/LICENSE" "LunaSVG-LICENSE.txt")
sculpt_notice("modules/juce_graphics/drawables/lunasvg/plutovg/LICENSE" "PlutoVG-LICENSE.txt")
sculpt_notice("modules/juce_graphics/image_formats/pnglib/LICENSE" "libpng-LICENSE.txt")
sculpt_notice("modules/juce_graphics/image_formats/jpglib/README" "JPEG-README.txt")
sculpt_notice("modules/juce_graphics/image_formats/libwebp/COPYING" "libwebp-COPYING.txt")
if(NOT APPLE)
    add_custom_command(TARGET SculptWingAudio POST_BUILD
        COMMAND "${CMAKE_COMMAND}" -E copy_directory "${SCULPT_NOTICE_DIR}"
                "$<TARGET_FILE_DIR:SculptWingAudio>/ThirdParty"
        VERBATIM)
endif()

# This small test is also buildable directly with a C++17 compiler, without an
# audio device, display server, external plugins, or JUCE dependencies.
add_executable(SculptWingAudioRoutingTest Tests/RoutingTest.cpp)
enable_testing()
add_test(NAME audio-routing COMMAND SculptWingAudioRoutingTest)
add_test(NAME host-self-test COMMAND SculptWingAudio --self-test)

option(SCULPT_AUDIO_BUILD_TEST_PLUGIN "Build a real VST3 fixture for host smoke tests" OFF)
if(SCULPT_AUDIO_BUILD_TEST_PLUGIN)
    juce_add_plugin(SculptWingAudioTestGain
        PRODUCT_NAME "SculptWingAudioTestGain"
        COMPANY_NAME "Sculpt"
        PLUGIN_MANUFACTURER_CODE Scpt
        PLUGIN_CODE Swtg
        FORMATS VST3
        IS_SYNTH FALSE
        NEEDS_MIDI_INPUT FALSE
        NEEDS_MIDI_OUTPUT FALSE
        COPY_PLUGIN_AFTER_BUILD FALSE
        VST3_AUTO_MANIFEST FALSE)
    target_sources(SculptWingAudioTestGain PRIVATE Tests/TestGain.cpp)
    target_compile_definitions(SculptWingAudioTestGain PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0)
    target_link_libraries(SculptWingAudioTestGain PRIVATE juce::juce_audio_processors juce::juce_recommended_config_flags)
    find_package(Python3 COMPONENTS Interpreter QUIET)
    if(Python3_Interpreter_FOUND)
        get_target_property(SCULPT_FIXTURE_BUNDLE SculptWingAudioTestGain_VST3 JUCE_PLUGIN_ARTEFACT_FILE)
        add_test(NAME native-audio-protocol
            COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/Tests/ProtocolSmoke.py"
                    "$<TARGET_FILE:SculptWingAudio>" "${SCULPT_FIXTURE_BUNDLE}")
        set_tests_properties(native-audio-protocol PROPERTIES TIMEOUT 90)
    endif()
endif()
