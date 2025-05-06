"""
Main server implementation for Crawl4AI MCP Server.
严格遵循JSON-RPC 2.0协议以兼容Claude Desktop。
"""

from crawl4ai_mcp.utils import (
    setup_logging,
    crawl_webpage_impl,
    crawl_website_impl,
    extract_structured_data_impl,
    save_as_markdown_impl,
    check_virtual_env
)
import json
import logging
import os
import sys
import asyncio
import traceback
from datetime import datetime
from typing import Dict, Any, List, Optional, Union, Tuple
from enum import Enum, auto

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    TextContent,
    Tool,
    ErrorData,
    GetPromptResult,
    Prompt,
    PromptArgument,
    PromptMessage,
    INVALID_PARAMS
)
from mcp.shared.exceptions import McpError
from pydantic import BaseModel, Field

# 添加CacheMode枚举类定义，解决"type object 'CacheMode' has no attribute 'DEFAULT'"错误


class CacheMode(Enum):
    DEFAULT = auto()
    BYPASS = auto()
    FORCE = auto()


# 设置日志记录器 - 确保所有日志输出到stderr
logger = setup_logging("crawl4ai_mcp")

# 服务器版本和协议版本
SERVER_VERSION = "0.1.0"
PROTOCOL_VERSION = "0.1.0"

# 请求ID计数器（处理旧版请求时使用）
request_id_counter = 1

# 模型定义


class CrawlWebpageParams(BaseModel):
    """Parameters for crawling a single webpage."""
    url: str = Field(description="要爬取的网页URL")
    include_images: bool = Field(default=True, description="是否在结果中包含图像")
    bypass_cache: bool = Field(default=False, description="是否绕过缓存")


class CrawlWebsiteParams(BaseModel):
    """Parameters for crawling a website."""
    url: str = Field(description="爬取起始URL")
    max_depth: int = Field(default=1, description="最大爬取深度")
    max_pages: int = Field(default=5, description="最大爬取页面数量")
    include_images: bool = Field(default=True, description="是否在结果中包含图像")


class ExtractStructuredDataParams(BaseModel):
    """Parameters for extracting structured data from a webpage."""
    url: str = Field(description="要提取数据的网页URL")
    schema: Optional[Dict[str, Any]] = Field(
        default=None, description="定义提取的schema")
    css_selector: str = Field(default="body", description="用于定位特定页面部分的CSS选择器")


class SaveAsMarkdownParams(BaseModel):
    """Parameters for saving a webpage as markdown."""
    url: str = Field(description="要爬取的网页URL")
    filename: str = Field(description="保存Markdown的文件名")
    include_images: bool = Field(default=True, description="是否包含图像")


def send_jsonrpc_response(id: Any, result: Any = None, error: Optional[Dict[str, Any]] = None):
    """
    发送严格遵循JSON-RPC 2.0格式的响应

    Args:
        id: 请求ID
        result: 响应结果（成功时）
        error: 错误信息（失败时）
    """
    response = {
        "jsonrpc": "2.0",
        "id": id
    }

    if error is not None:
        response["error"] = error
    else:
        response["result"] = result

    # 输出为JSON并强制刷新
    print(json.dumps(response, ensure_ascii=False), flush=True)


def send_jsonrpc_notification(method: str, params: Optional[Dict[str, Any]] = None):
    """
    发送严格遵循JSON-RPC 2.0格式的通知（无ID）

    Args:
        method: 方法名
        params: 参数（可选）
    """
    notification = {
        "jsonrpc": "2.0",
        "method": method
    }

    if params is not None:
        notification["params"] = params

    # 输出为JSON并强制刷新
    print(json.dumps(notification, ensure_ascii=False), flush=True)

# 获取所有工具列表 - 直接构建工具列表


def get_tools_list():
    """返回所有可用工具的列表"""
    return [
        {
            "name": "crawl_webpage",
            "description": "爬取单个网页并返回其内容为markdown格式。",
            "parameters": CrawlWebpageParams.model_json_schema(),
        },
        {
            "name": "crawl_website",
            "description": "从给定URL开始爬取网站，最多爬取指定深度和页面数量。",
            "parameters": CrawlWebsiteParams.model_json_schema(),
        },
        {
            "name": "extract_structured_data",
            "description": "使用CSS选择器从网页中提取结构化数据。",
            "parameters": ExtractStructuredDataParams.model_json_schema(),
        },
        {
            "name": "save_as_markdown",
            "description": "爬取网页并将内容保存为Markdown文件。",
            "parameters": SaveAsMarkdownParams.model_json_schema(),
        }
    ]

# 执行工具调用的函数


async def execute_tool_call(tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    执行工具调用

    Args:
        tool_name: 工具名称
        params: 调用参数

    Returns:
        包含执行结果或错误信息的字典
    """
    logger.info(f"执行工具: {tool_name} {params}")

    try:
        result = None

        if tool_name == "crawl_webpage":
            # 使用Pydantic模型验证参数
            validated_params = CrawlWebpageParams(**params)
            # 使用CacheMode.DEFAULT或CacheMode.BYPASS替代布尔值
            cache_mode = CacheMode.BYPASS if validated_params.bypass_cache else CacheMode.DEFAULT
            result_json = await crawl_webpage_impl(
                validated_params.url,
                validated_params.include_images,
                cache_mode  # 使用枚举值替代布尔值
            )
            result = json.loads(result_json)

        elif tool_name == "crawl_website":
            validated_params = CrawlWebsiteParams(**params)
            result_json = await crawl_website_impl(
                validated_params.url,
                validated_params.max_depth,
                validated_params.max_pages,
                validated_params.include_images
            )
            result = json.loads(result_json)

        elif tool_name == "extract_structured_data":
            validated_params = ExtractStructuredDataParams(**params)
            result_json = await extract_structured_data_impl(
                validated_params.url,
                validated_params.schema,
                validated_params.css_selector
            )
            result = json.loads(result_json)

        elif tool_name == "save_as_markdown":
            validated_params = SaveAsMarkdownParams(**params)
            result_json = await save_as_markdown_impl(
                validated_params.url,
                validated_params.filename,
                validated_params.include_images
            )
            result = json.loads(result_json)

        else:
            logger.error(f"未知工具: {tool_name}")
            raise ValueError(f"未知工具: {tool_name}")

        # 返回符合JSON-RPC 2.0格式的结果
        return {
            "tool": tool_name,
            "result": result
        }
    except Exception as e:
        logger.error(f"执行工具 {tool_name} 时出错: {str(e)}")
        logger.error(traceback.format_exc())
        # 抛出异常，让调用者处理
        raise e

# 处理旧版客户端发送的工具请求


async def handle_legacy_request(request: Dict[str, Any]) -> bool:
    """
    处理旧版客户端发送的请求，但用JSON-RPC 2.0格式回复

    Args:
        request: 请求数据

    Returns:
        是否成功处理请求
    """
    global request_id_counter

    request_id = request.get("id", f"req_{request_id_counter}")
    request_id_counter += 1

    if request.get("type") == "list_tools":
        # 返回工具列表（使用JSON-RPC 2.0格式）
        tools_list = get_tools_list()
        send_jsonrpc_response(request_id, {"tools": tools_list})
        return True

    elif request.get("type") == "call":
        # 调用工具（使用JSON-RPC 2.0格式响应）
        tool_name = request.get("tool")
        params = request.get("params", {})

        if not tool_name:
            error = {
                "code": -32602,
                "message": "未指定工具名称",
                "data": {"type": "INVALID_PARAMS"}
            }
            send_jsonrpc_response(request_id, error=error)
            return True

        try:
            # 执行工具调用
            result = await execute_tool_call(tool_name, params)
            send_jsonrpc_response(request_id, result)
        except Exception as e:
            error = {
                "code": -32000,
                "message": str(e),
                "data": {
                    "type": "EXECUTION_ERROR",
                    "error_type": type(e).__name__
                }
            }
            send_jsonrpc_response(request_id, error=error)
        return True

    return False

# 处理JSON-RPC 2.0请求


async def handle_jsonrpc_request(request: Dict[str, Any]) -> bool:
    """
    处理JSON-RPC 2.0格式请求

    Args:
        request: 请求数据

    Returns:
        是否成功处理请求
    """
    # 检查请求格式
    if not request.get("jsonrpc") == "2.0":
        return False

    method = request.get("method")
    params = request.get("params", {})
    request_id = request.get("id")

    # ID为空的请求是通知（Notification），不需要回复
    is_notification = "id" not in request

    # 初始化请求
    if method == "initialize":
        if not is_notification:
            result = {
                "protocolVersion": PROTOCOL_VERSION,
                "serverInfo": {
                    "name": "crawl4ai-mcp-server",
                    "version": SERVER_VERSION,
                },
                "capabilities": {
                    "tools": {
                        "list": True,
                    },
                },
            }
            send_jsonrpc_response(request_id, result)
        return True

    # 工具列表请求
    elif method == "tools/list":
        if not is_notification:
            result = {
                "tools": get_tools_list(),
            }
            send_jsonrpc_response(request_id, result)
        return True

    # 执行工具请求
    elif method == "tools/call":
        if not is_notification:
            try:
                tool_name = params.get("name")
                tool_params = params.get("arguments", {})

                if not tool_name:
                    error = {
                        "code": -32602,
                        "message": "未指定工具名称",
                        "data": {"type": "INVALID_PARAMS"}
                    }
                    send_jsonrpc_response(request_id, error=error)
                    return True

                # 执行工具调用
                result = await execute_tool_call(tool_name, tool_params)
                send_jsonrpc_response(request_id, result)

            except Exception as e:
                error = {
                    "code": -32000,
                    "message": str(e),
                    "data": {
                        "type": "EXECUTION_ERROR",
                        "error_type": type(e).__name__
                    }
                }
                send_jsonrpc_response(request_id, error=error)
        return True

    # 已初始化通知，无需返回结果
    elif method == "notifications/initialized":
        return True

    # 关闭请求
    elif method == "shutdown":
        if not is_notification:
            send_jsonrpc_response(request_id, None)

        # 退出进程
        logger.info("收到关闭请求，正在退出...")
        sys.exit(0)
        return True

    # 处理不了的方法
    return False

# 直接处理标准输入/输出


async def manual_stdio_server():
    """手动实现标准输入输出服务器，严格遵循JSON-RPC 2.0协议"""
    logger.info("启动手动实现的标准输入输出服务器")

    # 发送初始化响应 - 只使用JSON-RPC 2.0格式
    send_jsonrpc_response(0, {
        "protocolVersion": PROTOCOL_VERSION,
        "serverInfo": {
            "name": "crawl4ai-mcp-server",
            "version": SERVER_VERSION,
        },
        "capabilities": {
            "tools": {
                "list": True,
            },
        },
    })

    # 发送工具列表 - 只使用JSON-RPC 2.0格式
    send_jsonrpc_response(0, {
        "tools": get_tools_list()
    })

    # 设置标准输入为非阻塞模式
    import fcntl
    import os
    fl = fcntl.fcntl(sys.stdin.fileno(), fcntl.F_GETFL)
    fcntl.fcntl(sys.stdin.fileno(), fcntl.F_SETFL, fl | os.O_NONBLOCK)

    # 读取标准输入并处理请求
    buffer = ""
    while True:
        try:
            # 尝试读取一行
            chunk = sys.stdin.read(1024)
            if not chunk:
                # 如果没有数据，等待一会再试
                await asyncio.sleep(0.1)
                continue

            buffer += chunk

            # 处理完整的行
            lines = buffer.split("\n")
            buffer = lines.pop()  # 保留最后一个不完整的行

            for line in lines:
                if not line.strip():
                    continue

                try:
                    request = json.loads(line)
                    logger.info(f"收到请求: {request}")

                    # 尝试处理JSON-RPC 2.0请求
                    if await handle_jsonrpc_request(request):
                        continue

                    # 尝试处理旧版请求
                    if await handle_legacy_request(request):
                        continue

                    # 未知请求格式 - 使用JSON-RPC 2.0错误响应
                    logger.error(f"未知请求格式: {request}")
                    error = {
                        "code": -32600,
                        "message": "无效的请求",
                        "data": {
                            "request": request
                        }
                    }
                    # 尝试从请求中获取ID，如果没有则使用0
                    request_id = request.get("id", 0)
                    send_jsonrpc_response(request_id, error=error)

                except json.JSONDecodeError as e:
                    logger.error(f"JSON解析错误: {e}")
                    error = {
                        "code": -32700,
                        "message": "解析错误",
                        "data": {
                            "error": str(e),
                            "line": line
                        }
                    }
                    # 无法从无效JSON中获取ID，使用0
                    send_jsonrpc_response(0, error=error)

                except Exception as e:
                    logger.error(f"处理请求时出错: {e}")
                    logger.error(traceback.format_exc())
                    error = {
                        "code": -32603,
                        "message": "内部错误",
                        "data": {
                            "error": str(e),
                            "error_type": type(e).__name__
                        }
                    }
                    # 使用0作为默认ID
                    send_jsonrpc_response(0, error=error)

        except Exception as e:
            logger.error(f"读取输入时出错: {e}")
            logger.error(traceback.format_exc())
            await asyncio.sleep(0.1)


async def serve():
    """Run the Crawl4AI MCP server."""
    logger.info("启动Crawl4AI MCP服务器...")

    try:
        # 使用手动处理stdin/stdout的方法
        await manual_stdio_server()
    except Exception as e:
        logger.error(f"服务器运行时出错: {e}")
        logger.error(traceback.format_exc())
        raise

# 使用MCP库的服务器 - 作为备用方案


async def serve_with_mcp_lib():
    """使用MCP库运行服务器（备用方案）"""
    server = Server("Crawl4AI")

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        """List available tools in this server."""
        return [
            Tool(
                name="crawl_webpage",
                description="爬取单个网页并返回其内容为markdown格式。",
                inputSchema=CrawlWebpageParams.model_json_schema(),
            ),
            Tool(
                name="crawl_website",
                description="从给定URL开始爬取网站，最多爬取指定深度和页面数量。",
                inputSchema=CrawlWebsiteParams.model_json_schema(),
            ),
            Tool(
                name="extract_structured_data",
                description="使用CSS选择器从网页中提取结构化数据。",
                inputSchema=ExtractStructuredDataParams.model_json_schema(),
            ),
            Tool(
                name="save_as_markdown",
                description="爬取网页并将内容保存为Markdown文件。",
                inputSchema=SaveAsMarkdownParams.model_json_schema(),
            )
        ]

    @server.list_prompts()
    async def list_prompts() -> list[Prompt]:
        """List available prompts in this server."""
        return [
            Prompt(
                name="crawl",
                description="爬取网页并获取其内容",
                arguments=[
                    PromptArgument(
                        name="url", description="要爬取的网页URL", required=True
                    )
                ],
            ),
            Prompt(
                name="save_page",
                description="爬取网页并保存为Markdown文件",
                arguments=[
                    PromptArgument(
                        name="url", description="要爬取的网页URL", required=True
                    ),
                    PromptArgument(
                        name="filename", description="保存的文件名", required=True
                    )
                ],
            )
        ]

    @server.get_prompt()
    async def get_prompt(name: str, arguments: dict | None) -> GetPromptResult:
        """Handle prompt requests."""
        if name == "crawl":
            if not arguments or "url" not in arguments:
                raise McpError(ErrorData(code=INVALID_PARAMS,
                               message="URL is required"))

            url = arguments["url"]
            try:
                # 使用CacheMode.DEFAULT替代False
                result = await crawl_webpage_impl(url, True, CacheMode.DEFAULT)
                result_data = json.loads(result)
                if not result_data.get("success", False):
                    return GetPromptResult(
                        description=f"Failed to crawl {url}",
                        messages=[
                            PromptMessage(
                                role="user",
                                content=TextContent(type="text", text=result_data.get(
                                    "error", "Unknown error")),
                            )
                        ],
                    )

                return GetPromptResult(
                    description=f"Contents of {url}",
                    messages=[
                        PromptMessage(
                            role="user",
                            content=TextContent(
                                type="text", text=result_data.get("markdown", "No content"))
                        )
                    ],
                )
            except Exception as e:
                return GetPromptResult(
                    description=f"Failed to crawl {url}",
                    messages=[
                        PromptMessage(
                            role="user",
                            content=TextContent(type="text", text=str(e)),
                        )
                    ],
                )
        elif name == "save_page":
            if not arguments or "url" not in arguments or "filename" not in arguments:
                raise McpError(ErrorData(code=INVALID_PARAMS,
                               message="URL and filename are required"))

            url = arguments["url"]
            filename = arguments["filename"]
            try:
                result = await save_as_markdown_impl(url, filename, True)
                result_data = json.loads(result)
                if not result_data.get("success", False):
                    return GetPromptResult(
                        description=f"Failed to save {url}",
                        messages=[
                            PromptMessage(
                                role="user",
                                content=TextContent(type="text", text=result_data.get(
                                    "error", "Unknown error")),
                            )
                        ],
                    )

                return GetPromptResult(
                    description=f"Page saved as {filename}",
                    messages=[
                        PromptMessage(
                            role="user",
                            content=TextContent(
                                type="text",
                                text=f"Successfully saved {url} as {filename} with {result_data.get('word_count', 0)} words."
                            )
                        )
                    ],
                )
            except Exception as e:
                return GetPromptResult(
                    description=f"Failed to save {url}",
                    messages=[
                        PromptMessage(
                            role="user",
                            content=TextContent(type="text", text=str(e)),
                        )
                    ],
                )

        raise McpError(ErrorData(code=INVALID_PARAMS,
                       message=f"Unknown prompt: {name}"))

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        """Handle tool calls."""
        logger.info(f"工具调用: {name} {arguments}")

        if name == "crawl_webpage":
            try:
                params = CrawlWebpageParams(**arguments)
                # 使用CacheMode.DEFAULT或CacheMode.BYPASS替代布尔值
                cache_mode = CacheMode.BYPASS if params.bypass_cache else CacheMode.DEFAULT
                result = await crawl_webpage_impl(
                    params.url, params.include_images, cache_mode
                )
                return [TextContent(type="text", text=result)]
            except Exception as e:
                logger.error(f"爬取网页时出错: {str(e)}")
                raise McpError(ErrorData(code=INVALID_PARAMS, message=str(e)))

        elif name == "crawl_website":
            try:
                params = CrawlWebsiteParams(**arguments)
                result = await crawl_website_impl(
                    params.url, params.max_depth, params.max_pages, params.include_images
                )
                return [TextContent(type="text", text=result)]
            except Exception as e:
                logger.error(f"爬取网站时出错: {str(e)}")
                raise McpError(ErrorData(code=INVALID_PARAMS, message=str(e)))

        elif name == "extract_structured_data":
            try:
                params = ExtractStructuredDataParams(**arguments)
                result = await extract_structured_data_impl(
                    params.url, params.schema, params.css_selector
                )
                return [TextContent(type="text", text=result)]
            except Exception as e:
                logger.error(f"提取结构化数据时出错: {str(e)}")
                raise McpError(ErrorData(code=INVALID_PARAMS, message=str(e)))

        elif name == "save_as_markdown":
            try:
                params = SaveAsMarkdownParams(**arguments)
                result = await save_as_markdown_impl(
                    params.url, params.filename, params.include_images
                )
                return [TextContent(type="text", text=result)]
            except Exception as e:
                logger.error(f"保存为Markdown时出错: {str(e)}")
                raise McpError(ErrorData(code=INVALID_PARAMS, message=str(e)))

        else:
            logger.error(f"未知工具: {name}")
            raise McpError(ErrorData(code=INVALID_PARAMS,
                           message=f"Unknown tool: {name}"))

    # 输出工具列表和服务器启动信息
    tools_list = await list_tools()
    tool_names = [tool.name for tool in tools_list]
    logger.info(f"MCP服务器启动，可用工具: {', '.join(tool_names)}")

    # 创建服务器选项
    options = server.create_initialization_options()

    # 使用标准的stdio服务器运行
    logger.info("使用标准stdio服务器运行MCP服务")
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options, raise_exceptions=True)


def main():
    """Command-line entry point for the server."""
    logger.info("启动Crawl4AI MCP服务器...")
    check_virtual_env()

    try:
        # 使用asyncio.run运行服务器 - 默认使用手动实现的服务器
        asyncio.run(serve())
    except KeyboardInterrupt:
        logger.info("收到键盘中断，正在关闭服务器...")
    except Exception as e:
        logger.error(f"启动MCP服务器时出现未处理异常: {str(e)}")
        logger.error(traceback.format_exc())

        # 尝试使用MCP库的服务器作为备用
        logger.info("尝试使用MCP库的服务器作为备用方案...")
        try:
            asyncio.run(serve_with_mcp_lib())
        except Exception as e2:
            logger.error(f"备用服务器也启动失败: {str(e2)}")
            sys.exit(1)

    logger.info("Crawl4AI MCP服务器已关闭")


if __name__ == "__main__":
    main()
